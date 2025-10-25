import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import type { LoginInput, RegisterInput, UserResponse } from '@repo/types';
import { authApi, ApiError } from '../lib/api';

interface AuthContextType {
  user: UserResponse | null;
  login: (credentials: LoginInput) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  requestMagicLink: (email: string) => Promise<void>;
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
   * Runs on app initialization to restore session from httpOnly cookie
   */
  async function checkAuthStatus() {
    try {
      const { user: currentUser } = await authApi.me();
      setUser(currentUser);
    } catch (error) {
      // 401 means not authenticated - this is expected
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      } else {
        // Log other errors but don't block app initialization
        console.error('Failed to check auth status:', error);
        setUser(null);
      }
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
   * Login with email and password
   * Sets httpOnly cookie and updates user state
   */
  async function login(credentials: LoginInput): Promise<void> {
    try {
      const { user: loggedInUser } = await authApi.login(credentials);
      setUser(loggedInUser);
    } catch (error) {
      // Re-throw to allow UI to handle error display
      throw error;
    }
  }

  /**
   * Register a new user then automatically log them in
   * Registration endpoint doesn't set session cookie, so we call login after
   */
  async function register(data: RegisterInput): Promise<void> {
    try {
      // Step 1: Register the user
      await authApi.register(data);

      // Step 2: Automatically log them in with the same credentials
      await login({
        email: data.email,
        password: data.password,
      });
    } catch (error) {
      // Re-throw to allow UI to handle error display
      throw error;
    }
  }

  /**
   * Login with Google OAuth
   * Redirects to Google OAuth consent screen
   */
  async function loginWithGoogle(): Promise<void> {
    await authApi.loginWithGoogle();
  }

  /**
   * Request magic link via email
   * Sends email with sign-in link
   */
  async function requestMagicLink(email: string): Promise<void> {
    try {
      await authApi.requestMagicLink(email);
      // Success - caller should show "Check your email" message
    } catch (error) {
      // Re-throw to allow UI to handle error display
      throw error;
    }
  }

  /**
   * Logout - clears httpOnly cookie and local state
   * Redirects to login page
   */
  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch (error) {
      // Log error but still clear local state
      console.error('Logout error:', error);
    } finally {
      // Always clear local state and redirect
      setUser(null);
      navigate('/login');
    }
  }

  const value: AuthContextType = {
    user,
    login,
    loginWithGoogle,
    requestMagicLink,
    register,
    logout,
    isLoading,
    isAuthenticated: user !== null,
    authError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * Throws error if used outside AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
