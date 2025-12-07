import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import type { LoginInput, RegisterInput, UserResponse } from '@repo/types';
import {
  authApi,
  ApiError,
  refreshAccessToken,
  getCachedUser,
  setCachedUser,
  clearCachedUser,
} from '../lib/api';
import {
  getStoredTokens,
  clearTokens as clearStoredTokens,
  saveTokens,
  hasValidAccessToken,
} from '../lib/tokenStorage';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../lib/pkce';
import type { RootStackParamList } from '../navigation/types';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: UserResponse | null;
  login: (credentials?: LoginInput) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  requestMagicLink: (email: string) => Promise<void>;
  completeProviderLogin: () => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  handleDeepLink: (url: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const IS_WEB = Platform.OS === 'web';
const CLIENT_ID = IS_WEB ? 'web-spa' : 'mobile-app';
const REDIRECT_URI = IS_WEB
  ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'http://localhost:8081/auth/callback')
  : 'superbasic://auth/callback';
const API_URL = (
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

// Platform-specific storage helpers for PKCE
const pkceStorage = {
  async setItem(key: string, value: string): Promise<void> {
    if (IS_WEB && typeof window !== 'undefined') {
      window.sessionStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async getItem(key: string): Promise<string | null> {
    if (IS_WEB && typeof window !== 'undefined') {
      return window.sessionStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async deleteItem(key: string): Promise<void> {
    if (IS_WEB && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Check auth status on initialization
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Set up deep link listener (mobile) or check URL params (web)
  useEffect(() => {
    if (IS_WEB && typeof window !== 'undefined') {
      // Web: Check URL params for OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');

      if (error) {
        setAuthError(errorDescription || error || 'Authentication failed');
        setIsLoading(false);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      if (code) {
        handleCallback(code, state || undefined);
      }
    } else {
      // Mobile: Set up deep link listener
      const subscription = Linking.addEventListener('url', (event) => {
        handleDeepLink(event.url);
      });

      // Handle initial URL if app was opened via deep link
      Linking.getInitialURL().then((url) => {
        if (url) {
          handleDeepLink(url);
        }
      });

      return () => {
        subscription.remove();
      };
    }
  }, []);

  /**
   * Check if user is authenticated
   * Runs on app initialization using stored access token
   */
  async function checkAuthStatus() {
    setIsLoading(true);

    const isValid = await hasValidAccessToken();

    // If no valid access token, attempt refresh
    if (!isValid) {
      try {
        const userFromRefresh = await refreshAccessToken();
        if (userFromRefresh) {
          setUser(userFromRefresh);
          setIsLoading(false);
          return;
        }
      } catch {
        // Refresh failed - user is logged out
        setUser(null);
        setIsLoading(false);
        return;
      }
    }

    // Check if we have cached user from a previous token response
    const cached = getCachedUser();
    if (cached) {
      setUser(cached);
      setIsLoading(false);
      return;
    }

    // Fall back to /v1/me only if we don't have user data
    try {
      const { user: currentUser } = await authApi.me();
      setUser(currentUser);
      setCachedUser(currentUser);
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
   * Handle deep link for OAuth callback
   */
  async function handleDeepLink(url: string) {
    const parsed = Linking.parse(url);

    // Check if this is an auth callback
    if (parsed.path === 'auth/callback') {
      const code = parsed.queryParams?.code as string | undefined;
      const state = parsed.queryParams?.state as string | undefined;
      const error = parsed.queryParams?.error as string | undefined;
      const errorDescription = parsed.queryParams?.error_description as string | undefined;

      if (error) {
        setAuthError(errorDescription || error || 'Authentication failed');
        setIsLoading(false);
        navigation.navigate('Auth', { screen: 'Login' });
        return;
      }

      if (code) {
        await handleCallback(code, state);
      }
    }
  }

  // Track if callback has been handled to prevent double-invocation
  const callbackHandled = useRef(false);

  /**
   * Handle OAuth Callback
   * Exchanges authorization code for tokens
   */
  async function handleCallback(code: string, state?: string) {
    if (callbackHandled.current) return;
    callbackHandled.current = true;

    setIsLoading(true);

    const storedState = await pkceStorage.getItem('pkce_state');
    const verifier = await pkceStorage.getItem('pkce_verifier');

    // Check if this is a Google OAuth callback (special state) or magic link callback
    const isGoogleCallback = state === 'google-oauth';
    const isMagicLinkCallback = state === 'magic-link';
    const isExternalProvider = isGoogleCallback || isMagicLinkCallback;

    // For standard PKCE flow, validate state
    if (!isExternalProvider) {
      if (!state || !verifier) {
        setAuthError('Invalid callback parameters');
        setIsLoading(false);
        navigation.navigate('Auth', { screen: 'Login' });
        return;
      }

      if (state !== storedState) {
        setAuthError('Invalid state parameter');
        setIsLoading(false);
        navigation.navigate('Auth', { screen: 'Login' });
        return;
      }
    }

    try {
      // For external provider callbacks, exchange code without PKCE verifier
      const body = isExternalProvider
        ? new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            code,
            redirect_uri: REDIRECT_URI,
          })
        : new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier!,
          });

      const response = await fetch(`${API_URL}/v1/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        // Web: Include credentials to receive HttpOnly cookie
        ...(IS_WEB && { credentials: 'include' as RequestCredentials }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error_description || data.error || 'Token exchange failed');
      }

      const data = await response.json();

      // Store access token and refresh token
      await saveTokens({
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        refreshToken: data.refresh_token, // Mobile uses refresh tokens
      });

      // Clear PKCE storage
      await pkceStorage.deleteItem('pkce_state');
      await pkceStorage.deleteItem('pkce_verifier');

      // Use user data from token response if complete (avoids /v1/me call)
      if (data.user?.id && data.user?.email && data.user?.createdAt) {
        const currentUser: UserResponse = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? null,
          createdAt: data.user.createdAt,
        };
        setUser(currentUser);
        setCachedUser(currentUser);
      } else {
        // Fall back to /v1/me if no user data or incomplete data in response
        const { user: currentUser } = await authApi.me();
        setUser(currentUser);
        setCachedUser(currentUser);
      }

      // Web: Clean up URL after successful callback
      if (IS_WEB && typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/');
      }

      // Navigate to main app
      navigation.navigate('Main', { screen: 'HomeTab' });
      callbackHandled.current = false;
    } catch (error) {
      console.error('Callback error:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to complete login');
      navigation.navigate('Auth', { screen: 'Login' });
      callbackHandled.current = false;
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Initiate OAuth 2.1 Authorization Code Flow with PKCE
   * Web: Full-page redirect | Mobile: In-app browser
   */
  async function initiateOAuthFlow() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    // Store verifier and state (sessionStorage for web, SecureStore for mobile)
    await pkceStorage.setItem('pkce_verifier', verifier);
    await pkceStorage.setItem('pkce_state', state);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: state,
      scope: 'openid profile email',
    });

    const authUrl = `${API_URL}/v1/oauth/authorize?${params.toString()}`;

    if (IS_WEB && typeof window !== 'undefined') {
      // Web: Full-page redirect
      window.location.href = authUrl;
    } else {
      // Mobile: In-app browser
      const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
      if (result.type === 'cancel') {
        setAuthError('Login cancelled');
      }
    }
  }

  /**
   * Login with email and password
   * Initiates OAuth flow as the single entry path
   */
  async function login(credentials?: LoginInput): Promise<void> {
    // If credentials are provided, authenticate first to establish session
    if (credentials) {
      // For mobile, we need to implement password login differently
      // This is a simplified version - actual implementation in Phase 5
      throw new Error('Password login not yet implemented for mobile');
    }

    await initiateOAuthFlow();
  }

  /**
   * Complete OAuth/magic-link flows
   * Called after external provider authentication (Google, magic link)
   */
  const completeProviderLogin = useCallback(async () => {
    await checkAuthStatus();
  }, []);

  /**
   * Register a new user
   */
  async function register(data: RegisterInput): Promise<void> {
    throw new Error('Registration not yet implemented for mobile');
  }

  /**
   * Login with Google OAuth
   * Opens in-app browser for Google authentication
   */
  async function loginWithGoogle(): Promise<void> {
    // Redirect to backend Google OAuth endpoint
    const authUrl = `${API_URL}/v1/auth/google`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    if (result.type === 'cancel') {
      setAuthError('Google login cancelled');
    }
  }

  /**
   * Request magic link via email
   */
  async function requestMagicLink(email: string): Promise<void> {
    throw new Error('Magic link not yet implemented for mobile');
  }

  /**
   * Logout - clears tokens and local state
   */
  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await clearStoredTokens();
      clearCachedUser();
      setUser(null);
      navigation.navigate('Auth', { screen: 'Login' });
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
    handleDeepLink,
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
