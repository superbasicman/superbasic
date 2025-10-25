import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@repo/design-system';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle, requestMagicLink, authError } = useAuth();

  const [isDark, setIsDark] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [step, setStep] = useState<'initial' | 'password'>('initial');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Display auth errors from context (e.g., OAuth errors)
  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  const handleEmailContinue = () => {
    if (email) {
      setStep('password');
      setError(null);
    }
  };

  const handlePasswordContinue = async () => {
    if (!password) return;

    setIsLoading(true);
    setError(null);

    try {
      await login({ email, password });
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

  const handleCreateAccount = async () => {
    if (!password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Registration logic would go here
      // For now, just show error that registration needs to be implemented
      setError('Account creation not yet implemented');
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
    if (!email) return;

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

  const handleBack = () => {
    setStep('initial');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setMagicLinkSent(false);
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setStep('initial');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setMagicLinkSent(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  // Custom button component matching the design
  const CustomButton = ({
    children,
    onClick,
    variant = 'primary',
    disabled = false,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'primary' | 'toggle';
    disabled?: boolean;
  }) => {
    const baseStyles = 'w-full text-sm py-3 px-4 border transition-colors';
    const toggleStyles = 'text-xs py-2 px-3 border transition-colors';

    if (variant === 'toggle') {
      return (
        <button
          type="button"
          onClick={onClick}
          className={`${toggleStyles} ${
            isDark
              ? 'border-white hover:bg-white hover:text-black'
              : 'border-black hover:bg-black hover:text-white'
          }`}
        >
          {children}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${
          isDark
            ? 'border-white hover:bg-white hover:text-black disabled:opacity-50'
            : 'border-black hover:bg-black hover:text-white disabled:opacity-50'
        }`}
      >
        {children}
      </button>
    );
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-8 font-mono ${
        isDark ? 'bg-black text-white' : 'bg-white text-black'
      }`}
    >
      <div className="w-full max-w-md relative">
        {/* Theme toggle */}
        <div className="absolute -top-4 right-0">
          <CustomButton onClick={() => setIsDark(!isDark)} variant="toggle">
            {isDark ? '☀' : '☾'}
          </CustomButton>
        </div>

        {/* Header */}
        <div className="mb-12 text-center">
          <div className="text-2xl mb-2">SuperBasic</div>
          <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Money you can use
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            className={`mb-6 p-4 border ${
              isDark ? 'border-red-400 text-red-400' : 'border-red-600 text-red-600'
            }`}
          >
            {error}
          </div>
        )}

        {/* Magic link sent message */}
        {magicLinkSent && (
          <div
            className={`mb-6 p-4 border ${
              isDark ? 'border-green-400 text-green-400' : 'border-green-600 text-green-600'
            }`}
          >
            Check your email! We sent you a magic link to sign in.
          </div>
        )}

        {/* Initial step */}
        {step === 'initial' && (
          <div>
            <div className="text-sm mb-8 text-center">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </div>

            {/* OAuth button */}
            <div className="space-y-3 mb-6">
              <CustomButton onClick={loginWithGoogle}>
                {mode === 'signin' ? 'Continue' : 'Sign up'} with Gmail
              </CustomButton>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div
                  className={`w-full border-t ${
                    isDark ? 'border-gray-700' : 'border-gray-300'
                  }`}
                />
              </div>
              <div className="relative flex justify-center text-xs">
                <span
                  className={`px-2 ${
                    isDark ? 'bg-black text-gray-400' : 'bg-white text-gray-600'
                  }`}
                >
                  or
                </span>
              </div>
            </div>

            {/* Email input */}
            <div className="mb-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleEmailContinue)}
                placeholder="Email"
                isDark={isDark}
              />
            </div>

            {/* Continue button */}
            <div className="mb-6">
              <CustomButton onClick={handleEmailContinue}>Continue</CustomButton>
            </div>

            {/* Toggle mode */}
            <div className="text-center">
              <button type="button" onClick={toggleMode} className="text-xs underline">
                {mode === 'signin'
                  ? 'First time? Create account'
                  : 'Already have an account? Sign in'}
              </button>
            </div>

            {/* Terms */}
            <div
              className={`text-xs mt-8 text-center ${
                isDark ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              By continuing, you agree to our Terms of Service and Privacy Policy
            </div>
          </div>
        )}

        {/* Password step - Sign in */}
        {step === 'password' && mode === 'signin' && (
          <div>
            <button type="button" onClick={handleBack} className="text-xs underline mb-8">
              ← Back
            </button>

            <div className="text-sm mb-6">{email}</div>

            <div className="mb-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handlePasswordContinue)}
                placeholder="Password"
                autoFocus
                isDark={isDark}
              />
            </div>

            <div className="mb-6">
              <CustomButton onClick={handlePasswordContinue} disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Continue'}
              </CustomButton>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div
                  className={`w-full border-t ${
                    isDark ? 'border-gray-700' : 'border-gray-300'
                  }`}
                />
              </div>
              <div className="relative flex justify-center text-xs">
                <span
                  className={`px-2 ${
                    isDark ? 'bg-black text-gray-400' : 'bg-white text-gray-600'
                  }`}
                >
                  or
                </span>
              </div>
            </div>

            {/* Magic link option */}
            <div className="mb-6">
              <CustomButton onClick={handleMagicLink} disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send login link'}
              </CustomButton>
            </div>

            <div className={`text-xs mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              We'll email you a secure link. No password needed.
            </div>

            <div className="text-center">
              <button type="button" onClick={() => setMode('signup')} className="text-xs underline">
                First time? Create account
              </button>
            </div>
          </div>
        )}

        {/* Password step - Sign up */}
        {step === 'password' && mode === 'signup' && (
          <div>
            <button type="button" onClick={handleBack} className="text-xs underline mb-8">
              ← Back
            </button>

            <div className="text-sm mb-6">{email}</div>

            <div className="mb-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                isDark={isDark}
              />
            </div>

            <div className="mb-4">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleCreateAccount)}
                placeholder="Retype password"
                isDark={isDark}
              />
            </div>

            <div className="mb-6">
              <CustomButton onClick={handleCreateAccount} disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Create account'}
              </CustomButton>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div
                  className={`w-full border-t ${
                    isDark ? 'border-gray-700' : 'border-gray-300'
                  }`}
                />
              </div>
              <div className="relative flex justify-center text-xs">
                <span
                  className={`px-2 ${
                    isDark ? 'bg-black text-gray-400' : 'bg-white text-gray-600'
                  }`}
                >
                  or
                </span>
              </div>
            </div>

            {/* Magic link option */}
            <div className="mb-6">
              <CustomButton onClick={handleMagicLink} disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send login link'}
              </CustomButton>
            </div>

            <div className={`text-xs mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              We'll email you a secure link. No password needed.
            </div>

            <div className="text-center">
              <button type="button" onClick={() => setMode('signin')} className="text-xs underline">
                Already have an account? Sign in
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
