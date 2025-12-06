import { useEffect, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import CheckEmailMessage from '../components/CheckEmailMessage';
import { useAuth } from '../contexts/AuthContext';
import { useAuthForm } from '../hooks/useAuthForm';

type Screen = 'splash' | 'welcome' | 'auth';
type Mode = 'signin' | 'signup';
type Step = 'initial' | 'password';

export default function Login() {
  const [searchParams] = useSearchParams();
  const { loginWithGoogle, authError } = useAuth();
  const {
    email,
    password,
    confirmPassword,
    isLoading,
    error,
    magicLinkSent,
    verificationEmailSent,
    setEmail,
    setPassword,
    setConfirmPassword,
    setError,
    handleLogin,
    handleRegister,
    handleMagicLink,
    resetForm,
  } = useAuthForm();

  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('initial');
  const [fadeIn, setFadeIn] = useState(false);
  const [fromGetStarted, setFromGetStarted] = useState(false);

  // Splash intro animation (kept minimal)
  useEffect(() => {
    const fadeTimeout = setTimeout(() => setFadeIn(true), 50);
    const screenTimeout = setTimeout(() => setCurrentScreen('welcome'), 1600);
    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(screenTimeout);
    };
  }, []);

  // Fade transition when switching screens
  useEffect(() => {
    if (currentScreen === 'splash') return;
    setFadeIn(true);
  }, [currentScreen]);

  // Respect query param mode
  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'signup') {
      setMode('signup');
      setCurrentScreen('auth');
      setFromGetStarted(true);
    }
  }, [searchParams]);

  // Surface auth errors coming from provider callbacks
  useEffect(() => {
    if (authError) {
      setError(authError);
      setCurrentScreen('auth');
    }
  }, [authError, setError]);

  const handleEmailContinue = () => {
    if (email) {
      setStep('password');
      setError(null);
    }
  };

  const handlePasswordContinue = () => {
    if (mode === 'signin') {
      void handleLogin();
    } else {
      void handleRegister();
    }
  };

  const handleCreateAccount = () => {
    void handleRegister();
  };

  const handleMagicLinkRequest = () => {
    void handleMagicLink();
  };

  const handleBack = () => {
    setStep('initial');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setStep('initial');
    resetForm();
    setFromGetStarted(false);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>, action: () => void) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  if (verificationEmailSent) {
    return (
      <CheckEmailMessage
        email={email}
        isDark
        onToggleTheme={() => undefined}
        onReset={() => {
          resetForm();
          setMode('signin');
          setStep('initial');
          setCurrentScreen('auth');
        }}
      />
    );
  }

  // Splash Screen
  if (currentScreen === 'splash') {
    return (
      <div
        className="min-h-screen bg-black flex items-center justify-center"
        style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <div className={`text-center transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-white text-4xl font-light tracking-tight mb-3">SuperBasic Finance</div>
          <div className="text-white/50 text-lg font-light">your finances, in plain text</div>
          <div className="flex justify-center">
            <div className="w-6 h-px bg-white/30 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Welcome Screen
  if (currentScreen === 'welcome') {
    return (
      <div
        className="min-h-screen bg-black flex flex-col"
        style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <div
          className={`flex-1 flex flex-col justify-center px-10 transition-opacity duration-300 ${
            fadeIn ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="mb-16">
            <div className="text-white/40 text-xs tracking-widest uppercase mb-6">Welcome to</div>
            <div className="text-white text-5xl font-light tracking-tight leading-none mb-4">
              SuperBasic Finance
            </div>
            <div className="text-white/50 text-lg font-light">your finances, in plain text</div>
          </div>

          <div className="space-y-6 mb-16">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 border border-white/20 flex items-center justify-center">
                <span className="text-white/60 text-lg">→</span>
              </div>
              <div>
                <div className="text-white text-sm">Search any transaction</div>
                <div className="text-white/40 text-xs">By date or keyword</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 border border-white/20 flex items-center justify-center">
                <span className="text-white/60 text-lg">○</span>
              </div>
              <div>
                <div className="text-white text-sm">Securely share</div>
                <div className="text-white/40 text-xs">With friends, family, or advisors</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 border border-white/20 flex items-center justify-center">
                <span className="text-white/60 text-lg">◇</span>
              </div>
              <div>
                <div className="text-white text-sm">Create custom views</div>
                <div className="text-white/40 text-xs">With filters, sorts & groups</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 border border-white/20 flex items-center justify-center">
                <span className="text-white/60 text-lg">✶</span>
              </div>
              <div>
                <div className="text-white text-sm">Custom budgets and goals</div>
                <div className="text-white/40 text-xs">Track what matters and adjust</div>
              </div>
            </div>
          </div>
        </div>

        <div className={`px-10 pb-12 transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
          <button
            type="button"
            onClick={() => {
              setFromGetStarted(true);
              setCurrentScreen('auth');
            }}
            className="w-full py-4 bg-white text-black text-sm font-medium tracking-wide transition-all hover:bg-white/90 active:scale-[0.98]"
          >
            Get started
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setFromGetStarted(false);
              setCurrentScreen('auth');
            }}
            className="w-full py-4 text-white/60 text-sm mt-3 transition-colors hover:text-white"
          >
            I already have an account
          </button>

          <div className="flex justify-center mt-8">
            <div className="w-32 h-1 bg-white/20 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // Auth Screen
  return (
    <div
      className="min-h-screen bg-black flex flex-col"
      style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <div className={`px-6 pt-14 pb-6 transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        {step === 'initial' ? (
          <button
            type="button"
            onClick={() => {
              setFromGetStarted(false);
              setCurrentScreen('welcome');
            }}
            className="text-white/50 text-sm flex items-center gap-2 hover:text-white transition-colors"
          >
            <span>←</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleBack}
            className="text-white/50 text-sm flex items-center gap-2 hover:text-white transition-colors"
          >
            <span>←</span>
          </button>
        )}
      </div>

      <div className={`flex-1 px-10 transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        {error && (
          <div className="mb-6 p-4 border border-red-400 text-red-300 bg-red-500/10">
            {error}
          </div>
        )}

        {step === 'initial' && (
          <>
            <div className="mb-10">
              <div className="text-white text-3xl font-light mb-2">
                {mode === 'signin' ? (fromGetStarted ? 'Welcome' : 'Welcome back') : 'Create your account'}
              </div>
              <div className="text-white/40 text-sm">
                {mode === 'signin' ? 'Sign in to continue' : 'Join SuperBasic today'}
              </div>
            </div>

            <div className="space-y-3 mb-8">
              <button
                type="button"
                className="w-full py-4 border border-white/20 text-white text-sm flex items-center justify-center gap-3 transition-all hover:bg-white hover:text-black active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                Continue with Apple
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  void loginWithGoogle();
                }}
                disabled={isLoading}
                className="w-full py-4 border border-white/20 text-white text-sm flex items-center justify-center gap-3 transition-all hover:bg-white hover:text-black active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
              <button
                type="button"
                className="w-full py-4 border border-white/20 text-white text-sm flex items-center justify-center gap-3 transition-all hover:bg-white hover:text-black active:scale-[0.98]"
              >
                <span className="text-lg">⚿</span>
                Continue with passkey
              </button>
            </div>

            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-black text-white/30">or</span>
              </div>
            </div>

            <div className="mb-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleEmailContinue)}
                placeholder="Email address"
                className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={handleEmailContinue}
              className="w-full py-4 border border-white/20 text-white text-sm transition-all hover:bg-white hover:text-black active:scale-[0.98]"
            >
              Continue with email
            </button>

            <div className="text-center mt-8">
              <button
                type="button"
                onClick={toggleMode}
                className="text-white/40 text-sm hover:text-white transition-colors"
              >
                {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </>
        )}

        {step === 'password' && mode === 'signin' && (
          <>
            <div className="mb-10">
              <div className="text-white text-3xl font-light mb-2">Enter password</div>
              <div className="text-white/40 text-sm">{email}</div>
            </div>

            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handlePasswordContinue)}
                placeholder="Password"
                autoFocus
                className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={handlePasswordContinue}
              disabled={isLoading}
              className="w-full py-4 bg-white text-black text-sm font-medium transition-all hover:bg-white/90 active:scale-[0.98] mb-4 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-black text-white/30">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMagicLinkRequest}
              disabled={isLoading}
              className="w-full py-4 border border-white/20 text-white text-sm transition-all hover:bg-white hover:text-black active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send magic link instead'}
            </button>
            <div className="text-white/30 text-xs text-center mt-3">
              {magicLinkSent ? 'Check your email for a magic link.' : "We'll email you a secure link"}
            </div>
          </>
        )}

        {step === 'password' && mode === 'signup' && (
          <>
            <div className="mb-10">
              <div className="text-white text-3xl font-light mb-2">Set your password</div>
              <div className="text-white/40 text-sm">{email}</div>
            </div>

            <div className="space-y-3 mb-6">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create password"
                autoFocus
                className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleCreateAccount)}
                placeholder="Confirm password"
                className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={handleCreateAccount}
              disabled={isLoading}
              className="w-full py-4 bg-white text-black text-sm font-medium transition-all hover:bg-white/90 active:scale-[0.98] mb-4 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-black text-white/30">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMagicLinkRequest}
              disabled={isLoading}
              className="w-full py-4 border border-white/20 text-white text-sm transition-all hover:bg-white hover:text-black active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send magic link instead'}
            </button>
            <div className="text-white/30 text-xs text-center mt-3">
              {magicLinkSent ? 'Check your email for a magic link.' : "We'll email you a secure link"}
            </div>
          </>
        )}
      </div>

      <div className={`px-10 pb-12 pt-8 transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-white/20 text-xs text-center leading-relaxed">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </div>

        <div className="flex justify-center mt-6">
          <div className="w-32 h-1 bg-white/20 rounded-full" />
        </div>
      </div>
    </div>
  );
}
