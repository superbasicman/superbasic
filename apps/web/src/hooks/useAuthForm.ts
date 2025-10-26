import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';

interface UseAuthFormReturn {
  // State
  email: string;
  password: string;
  confirmPassword: string;
  isLoading: boolean;
  error: string | null;
  magicLinkSent: boolean;

  // Setters
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  setError: (value: string | null) => void;

  // Actions
  handleLogin: () => Promise<void>;
  handleRegister: () => Promise<void>;
  handleMagicLink: () => Promise<void>;
  resetForm: () => void;
}

/**
 * Custom hook for auth form logic
 * Extracts state management, validation, and error handling from UI components
 */
export function useAuthForm(): UseAuthFormReturn {
  const navigate = useNavigate();
  const { login, register, requestMagicLink } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login({ email, password });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        // Auth.js CredentialsSignin error is already mapped to user-friendly message
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await register({ email, password });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('Email is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await requestMagicLink(email);
      setMagicLinkSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to send magic link. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setMagicLinkSent(false);
  };

  return {
    // State
    email,
    password,
    confirmPassword,
    isLoading,
    error,
    magicLinkSent,

    // Setters
    setEmail,
    setPassword,
    setConfirmPassword,
    setError,

    // Actions
    handleLogin,
    handleRegister,
    handleMagicLink,
    resetForm,
  };
}
