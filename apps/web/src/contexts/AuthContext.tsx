import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { LoginInput, RegisterInput, UserResponse } from '@repo/types';
import { authApi, ApiError } from '../lib/api';

interface AuthContextType {
  user: UserResponse | null;
  login: (credentials: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check auth status on initialization
  useEffect(() => {
    checkAuthStatus();
  }, []);

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
    register,
    logout,
    isLoading,
    isAuthenticated: user !== null,
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
