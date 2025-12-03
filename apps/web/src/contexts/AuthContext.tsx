import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import type { LoginInput, RegisterInput, UserResponse } from '@repo/types';
import { authApi, ApiError } from '../lib/api';
import { getStoredTokens, clearTokens as clearStoredTokens, saveTokens } from '../lib/tokenStorage';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../lib/pkce';

interface AuthContextType {
  user: UserResponse | null;
  login: (credentials?: LoginInput) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  requestMagicLink: () => Promise<void>;
  completeProviderLogin: () => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// TODO: Move to config
const CLIENT_ID = 'web-dashboard';
const REDIRECT_URI = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Check auth status on initialization and after navigation
  useEffect(() => {
    checkAuthStatus();
  }, [location.pathname]);

  // Handle OAuth/auth errors from query params
  useEffect(() => {
    handleAuthErrors();
  }, [location.search]);

  /**
   * Check if user is authenticated by calling /v1/me
   * Runs on app initialization using stored access token
   */
  async function checkAuthStatus() {
    // If we are in the callback flow, handle it
    if (location.pathname === '/auth/callback') {
      await handleCallback();
      return;
    }

    setIsLoading(true);

    const tokens = getStoredTokens();
    const hasValidAccessToken =
      !!tokens && typeof tokens.accessTokenExpiresAt === 'number' && tokens.accessTokenExpiresAt > Date.now();

    if (!hasValidAccessToken) {
      clearStoredTokens();
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const { user: currentUser } = await authApi.me();
      setUser(currentUser);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      } else {
        console.error('Failed to check auth status:', error);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Handle OAuth Callback
   * Exchanges authorization code for tokens
   */
  async function handleCallback() {
    setIsLoading(true);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const storedState = sessionStorage.getItem('pkce_state');
    const verifier = sessionStorage.getItem('pkce_verifier');

    if (errorParam) {
      setAuthError(errorDescription || errorParam || 'Authentication failed');
      setIsLoading(false);
      navigate('/login', { replace: true });
      return;
    }

    if (!code || !state || !verifier) {
      setAuthError('Invalid callback parameters');
      setIsLoading(false);
      navigate('/login', { replace: true });
      return;
    }

    if (state !== storedState) {
      setAuthError('Invalid state parameter');
      setIsLoading(false);
      navigate('/login', { replace: true });
      return;
    }

    try {
      // Exchange code for tokens
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/v1/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error_description || data.error || 'Token exchange failed');
      }

      const data = await response.json();

      // Store access token
      saveTokens({
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      });

      // Clear PKCE storage
      sessionStorage.removeItem('pkce_state');
      sessionStorage.removeItem('pkce_verifier');

      // Fetch user profile
      const { user: currentUser } = await authApi.me();
      setUser(currentUser);

      // Redirect to home
      navigate('/');
    } catch (error) {
      console.error('Callback error:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to complete login');
      navigate('/login', { replace: true });
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Handle authentication errors from query params
   * Auth.js redirects with ?error=... on OAuth failures
   */
  function handleAuthErrors() {
    const error = searchParams.get('error');

    if (error) {
      const errorDescription = searchParams.get('error_description') || 'Authentication failed';
      console.log('[AuthContext] Auth error detected:', error, errorDescription);
      setAuthError(errorDescription);

      // Clear error params after showing message
      setTimeout(() => {
        setSearchParams({});
        setAuthError(null);
      }, 5000);
    }
  }

  /**
   * Initiate OAuth 2.1 Authorization Code Flow with PKCE
   */
  async function initiateOAuthFlow() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    // Store verifier in sessionStorage to verify later
    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('pkce_state', state);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: state,
      scope: 'openid profile email',
    });

    // Redirect to API authorize endpoint
    // Note: In a real app, API_URL should be from env
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    window.location.href = `${apiUrl}/v1/oauth/authorize?${params.toString()}`;
  }

  /**
   * Login with email and password
   * Now initiates OAuth flow as the single entry path
   */
  async function login(credentials?: LoginInput): Promise<void> {
    const searchParams = new URLSearchParams(location.search);
    const returnTo = searchParams.get('returnTo');

    // When redirected from /v1/oauth/authorize without a session, complete credential login
    // then bounce back to the authorize URL to continue the OAuth flow.
    if (returnTo) {
      if (!credentials) {
        throw new Error('Credentials are required to sign in');
      }
      await authApi.login(credentials);
      window.location.href = returnTo;
      return;
    }

    await initiateOAuthFlow();
  }

  /**
   * Complete OAuth/magic-link flows by exchanging the refresh cookie for an access token
   * and hydrating the authenticated user in context.
   */
  const completeProviderLogin = useCallback(async () => {
    // Legacy bridge no longer used; rely on OAuth callback flow.
    clearStoredTokens();
    throw new Error('Legacy provider login is no longer supported. Please sign in again.');
  }, []);

  /**
   * Register a new user then automatically log them in
   */
  async function register(data: RegisterInput): Promise<void> {
    try {
      await authApi.register(data);
      await login();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Login with Google OAuth
   */
  async function loginWithGoogle(): Promise<void> {
    await initiateOAuthFlow();
  }

  /**
   * Request magic link via email
   */
  async function requestMagicLink(): Promise<void> {
    console.warn('Magic link flow is deprecated; using OAuth authorize flow instead.');
    await initiateOAuthFlow();
  }

  /**
   * Logout - clears httpOnly cookie and local state
   */
  async function logout(): Promise<void> {
    try {
      // Call revoke endpoint
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      await fetch(`${apiUrl}/v1/oauth/revoke`, { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearStoredTokens();
      setUser(null);
      navigate('/login');
    }
  }

  const value: AuthContextType = {
    user,
    login,
    loginWithGoogle,
    requestMagicLink,
    completeProviderLogin,
    register,
    logout,
    isLoading,
    isAuthenticated: user !== null,
    authError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
