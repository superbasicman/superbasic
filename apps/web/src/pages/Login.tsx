import { useEffect, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import CheckEmailMessage from '../components/CheckEmailMessage';
import { useAuth } from '../contexts/AuthContext';
import { useAuthForm } from '../hooks/useAuthForm';

type Screen = 'splash' | 'welcome' | 'auth';
type Mode = 'signin' | 'signup';
type Step = 'initial' | 'password';
type Theme = 'coffeeDark' | 'coffeeLight' | 'pureDark' | 'pureLight';

type ThemePalette = {
  bg: string;
  primaryText: string;
  primarySoft: string;
  secondaryText: string;
  mutedText: string;
  chipIcon: string;
  accentBorder: string;
  accentBorderSoft: string;
  subtleBg: string;
  divider: string;
  barBg: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonPrimaryHover: string;
  buttonOutlineText: string;
  buttonOutlineHoverBg: string;
  inputBg: string;
  inputBorder: string;
  inputFocusBorder: string;
  placeholder: string;
  chipBg: string;
  toggleBorder: string;
  toggleBg: string;
  toggleHoverBg: string;
};

const palette: Record<Theme, ThemePalette> = {
  coffeeDark: {
    bg: 'bg-[#120a05]',
    primaryText: 'text-[#f9e8cf]',
    primarySoft: 'text-[#f3ddba]',
    secondaryText: 'text-[#d7ba90]',
    mutedText: 'text-[#b8966a]',
    chipIcon: 'text-[#f3ddba]',
    accentBorder: 'border-[#f9e8cf33]',
    accentBorderSoft: 'border-[#f9e8cf1f]',
    subtleBg: 'bg-[#f9e8cf0f]',
    divider: 'border-[#f9e8cf26]',
    barBg: 'bg-[#f9e8cf33]',
    buttonPrimaryBg: 'bg-[#f5ddc0]',
    buttonPrimaryText: 'text-[#2b150a]',
    buttonPrimaryHover: 'hover:bg-[#f1d2ab]',
    buttonOutlineText: 'text-[#f9e8cf]',
    buttonOutlineHoverBg: 'hover:bg-[#f9e8cf0f]',
    inputBg: 'bg-[#f9e8cf0f]',
    inputBorder: 'border-[#f9e8cf33]',
    inputFocusBorder: 'focus:border-[#f9e8cf80]',
    placeholder: 'placeholder-[#f3ddba80]',
    chipBg: 'bg-[#f9e8cf12]',
    toggleBorder: 'border-[#f9e8cf66]',
    toggleBg: 'bg-[#f9e8cf1a]',
    toggleHoverBg: 'hover:bg-[#f9e8cf33]',
  },
  coffeeLight: {
    bg: 'bg-[#f5e6d3]',
    primaryText: 'text-[#2b150a]',
    primarySoft: 'text-[#3b1f0f]',
    secondaryText: 'text-[#7b5533]',
    mutedText: 'text-[#93623d]',
    chipIcon: 'text-[#7b5533]',
    accentBorder: 'border-[#2b150a33]',
    accentBorderSoft: 'border-[#2b150a1f]',
    subtleBg: 'bg-[#2b150a0a]',
    divider: 'border-[#2b150a26]',
    barBg: 'bg-[#2b150a33]',
    buttonPrimaryBg: 'bg-[#2b150a]',
    buttonPrimaryText: 'text-[#f5e6d3]',
    buttonPrimaryHover: 'hover:bg-[#3b1f10]',
    buttonOutlineText: 'text-[#2b150a]',
    buttonOutlineHoverBg: 'hover:bg-[#2b150a0a]',
    inputBg: 'bg-[#2b150a08]',
    inputBorder: 'border-[#2b150a33]',
    inputFocusBorder: 'focus:border-[#2b150a80]',
    placeholder: 'placeholder-[#7b553380]',
    chipBg: 'bg-[#2b150a0d]',
    toggleBorder: 'border-[#2b150a66]',
    toggleBg: 'bg-[#2b150a12]',
    toggleHoverBg: 'hover:bg-[#2b150a26]',
  },
  pureDark: {
    bg: 'bg-[#000000]',
    primaryText: 'text-[#ffffff]',
    primarySoft: 'text-[#f5f5f5]',
    secondaryText: 'text-[#d4d4d4]',
    mutedText: 'text-[#9ca3af]',
    chipIcon: 'text-[#e5e7eb]',
    accentBorder: 'border-[#ffffff33]',
    accentBorderSoft: 'border-[#ffffff22]',
    subtleBg: 'bg-[#ffffff0a]',
    divider: 'border-[#ffffff1f]',
    barBg: 'bg-[#ffffff33]',
    buttonPrimaryBg: 'bg-[#ffffff]',
    buttonPrimaryText: 'text-[#000000]',
    buttonPrimaryHover: 'hover:bg-[#f5f5f5]',
    buttonOutlineText: 'text-[#ffffff]',
    buttonOutlineHoverBg: 'hover:bg-[#ffffff0a]',
    inputBg: 'bg-[#111827]',
    inputBorder: 'border-[#374151]',
    inputFocusBorder: 'focus:border-[#e5e7eb]',
    placeholder: 'placeholder-[#9ca3af]',
    chipBg: 'bg-[#111827]',
    toggleBorder: 'border-[#e5e7eb88]',
    toggleBg: 'bg-[#111827]',
    toggleHoverBg: 'hover:bg-[#1f2937]',
  },
  pureLight: {
    bg: 'bg-[#ffffff]',
    primaryText: 'text-[#000000]',
    primarySoft: 'text-[#111827]',
    secondaryText: 'text-[#4b5563]',
    mutedText: 'text-[#6b7280]',
    chipIcon: 'text-[#4b5563]',
    accentBorder: 'border-[#00000026]',
    accentBorderSoft: 'border-[#0000001a]',
    subtleBg: 'bg-[#00000005]',
    divider: 'border-[#0000001a]',
    barBg: 'bg-[#00000026]',
    buttonPrimaryBg: 'bg-[#000000]',
    buttonPrimaryText: 'text-[#ffffff]',
    buttonPrimaryHover: 'hover:bg-[#111827]',
    buttonOutlineText: 'text-[#000000]',
    buttonOutlineHoverBg: 'hover:bg-[#00000008]',
    inputBg: 'bg-[#f9fafb]',
    inputBorder: 'border-[#e5e7eb]',
    inputFocusBorder: 'focus:border-[#111827]',
    placeholder: 'placeholder-[#9ca3af]',
    chipBg: 'bg-[#f3f4f6]',
    toggleBorder: 'border-[#00000055]',
    toggleBg: 'bg-[#00000008]',
    toggleHoverBg: 'hover:bg-[#00000012]',
  },
};

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
  const [theme, setTheme] = useState<Theme>('pureDark');
  const MAGIC_LINK_BUTTON_TEXT = 'Send login link';
  const t = palette[theme];
  const themeOrder: Theme[] = ['pureDark', 'coffeeDark', 'pureLight', 'coffeeLight'];
  const rootFont = { fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif" };
  const isDarkTheme = theme === 'pureDark' || theme === 'coffeeDark';

  // Splash intro timing
  useEffect(() => {
    const fadeTimeout = setTimeout(() => setFadeIn(true), 100);
    const screenTimeout = setTimeout(() => setCurrentScreen('welcome'), 2000);
    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(screenTimeout);
    };
  }, []);

  // Subtle fade between screens
  useEffect(() => {
    if (currentScreen === 'splash') {
      return;
    }
    setFadeIn(false);
    const fadeTimeout = setTimeout(() => setFadeIn(true), 50);
    return () => {
      clearTimeout(fadeTimeout);
    };
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

  const toggleMode = (nextMode?: Mode, nextStep?: Step, options?: { resetGetStarted?: boolean }) => {
    const targetMode = nextMode ?? (mode === 'signin' ? 'signup' : 'signin');
    setMode(targetMode);
    if (nextStep) {
      setStep(nextStep);
    }
    if (options?.resetGetStarted) {
      setFromGetStarted(false);
    }
    setError(null);
  };

  const toggleTheme = () => {
    setTheme((prev): Theme => {
      const idx = themeOrder.indexOf(prev);
      return themeOrder[(idx + 1) % themeOrder.length] as Theme;
    });
  };

  const togglePrompt =
    mode === 'signin' && !fromGetStarted ? "Don't have an account? Sign up" : 'Already have an account? Sign in';

  const handleToggleClick = (nextStep?: Step) => {
    if (mode === 'signin' && !fromGetStarted) {
      toggleMode('signup', nextStep ?? step);
    } else {
      toggleMode('signin', nextStep ?? step, { resetGetStarted: true });
    }
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
        isDark={isDarkTheme}
        onToggleTheme={toggleTheme}
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
        className={`min-h-screen ${t.bg} flex items-center justify-center relative`}
        style={rootFont}
      >
        <button
          type="button"
          onClick={toggleTheme}
          className={`absolute top-6 right-6 w-7 h-7 rounded-full border ${t.toggleBorder} ${t.toggleBg} ${t.toggleHoverBg} transition-colors`}
          aria-label="Toggle theme"
        />
        <div
          className={`text-center transition-all duration-1000 ${
            fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div className={`${t.primaryText} text-4xl font-light tracking-tight mb-3`}>SuperBasic Finance</div>
          <div className={`${t.primarySoft} text-lg font-light`}>your finances, in plain text</div>
          <div className="flex justify-center mt-3">
            <div className={`w-10 h-[2px] rounded-full ${t.barBg} animate-pulse`} />
          </div>
        </div>
      </div>
    );
  }

  // Welcome Screen
  if (currentScreen === 'welcome') {
    return (
      <div
        className={`min-h-screen ${t.bg} flex flex-col relative`}
        style={rootFont}
      >
        <button
          type="button"
          onClick={toggleTheme}
          className={`absolute top-6 right-6 w-7 h-7 rounded-full border ${t.toggleBorder} ${t.toggleBg} ${t.toggleHoverBg} transition-colors z-50`}
          aria-label="Toggle theme"
        />
        <div
          className={`flex-1 flex flex-col justify-center px-10 w-full max-w-5xl mx-auto transition-all duration-700 ${
            fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="mb-16">
            <div className={`${t.secondaryText} text-xs tracking-widest uppercase mb-6`}>Welcome to</div>
            <div className={`${t.primaryText} text-5xl font-light tracking-tight leading-none mb-4`}>
              SuperBasic Finance
            </div>
            <div className={`${t.primarySoft} text-lg font-light`}>your finances, in plain text</div>
          </div>

          <div className="space-y-6 mb-16">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 border ${t.accentBorderSoft} ${t.chipBg} flex items-center justify-center rounded-full`}>
                <span className={`${t.chipIcon} text-lg`}>→</span>
              </div>
              <div>
                <div className={`${t.primaryText} text-sm`}>Search any transaction</div>
                <div className={`${t.secondaryText} text-xs`}>By date or keyword</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 border ${t.accentBorderSoft} ${t.chipBg} flex items-center justify-center rounded-full`}>
                <span className={`${t.chipIcon} text-lg`}>○</span>
              </div>
              <div>
                <div className={`${t.primaryText} text-sm`}>Securely share</div>
                <div className={`${t.secondaryText} text-xs`}>With friends, family, or advisors</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 border ${t.accentBorderSoft} ${t.chipBg} flex items-center justify-center rounded-full`}>
                <span className={`${t.chipIcon} text-lg`}>◇</span>
              </div>
              <div>
                <div className={`${t.primaryText} text-sm`}>Create custom views</div>
                <div className={`${t.secondaryText} text-xs`}>With filters, sorts & groups</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 border ${t.accentBorderSoft} ${t.chipBg} flex items-center justify-center rounded-full`}>
                <span className={`${t.chipIcon} text-lg`}>✶</span>
              </div>
              <div>
                <div className={`${t.primaryText} text-sm`}>Custom budgets and goals</div>
                <div className={`${t.secondaryText} text-xs`}>Track what matters and adjust</div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`px-10 pb-12 w-full max-w-5xl mx-auto transition-all duration-700 delay-300 ${
            fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setFromGetStarted(true);
              setMode('signup');
              setCurrentScreen('auth');
              setStep('initial');
            }}
            className={`w-full py-4 ${t.buttonPrimaryBg} ${t.buttonPrimaryText} text-sm font-medium tracking-wide transition-all ${t.buttonPrimaryHover} active:scale-[0.98]`}
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
            className={`w-full py-4 border ${t.accentBorderSoft} ${t.buttonOutlineText} text-sm mt-3 transition-all ${t.buttonOutlineHoverBg}`}
          >
            I already have an account
          </button>
        </div>
      </div>
    );
  }

  // Auth Screen
  return (
    <div
      className={`min-h-screen ${t.bg} flex flex-col relative`}
      style={rootFont}
    >
      <button
        type="button"
        onClick={toggleTheme}
        className={`absolute top-6 right-6 w-7 h-7 rounded-full border ${t.toggleBorder} ${t.toggleBg} ${t.toggleHoverBg} transition-colors z-50`}
        aria-label="Toggle theme"
      />

      <div className="px-6 pt-14 pb-6 w-full max-w-xl mx-auto">
        {step === 'initial' ? (
          <button
            type="button"
            onClick={() => {
              setFromGetStarted(false);
              setCurrentScreen('welcome');
            }}
            className={`${t.secondaryText} text-sm flex items-center gap-2 hover:opacity-80 transition-colors`}
          >
            <span>←</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleBack}
            className={`${t.secondaryText} text-sm flex items-center gap-2 hover:opacity-80 transition-colors`}
          >
            <span>←</span>
          </button>
        )}
      </div>

      <div
        className={`flex-1 px-10 w-full max-w-xl mx-auto transition-all duration-500 ${
          fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {error && (
          <div className="mb-6 p-4 border border-red-400 text-red-300 bg-red-500/10">
            {error}
          </div>
        )}

        {step === 'initial' && (
          <>
            <div className="mb-10">
              <div className={`${t.primaryText} text-3xl font-light mb-2`}>
                {mode === 'signin' ? (fromGetStarted ? 'Welcome' : 'Welcome back') : 'Create your account'}
              </div>
              <div className={`${t.secondaryText} text-sm`}>
                {mode === 'signin' ? 'Sign in to continue' : 'Join SuperBasic today'}
              </div>
            </div>

            <div className="space-y-3 mb-8">
              <button
                type="button"
                className={`w-full py-4 border ${t.accentBorderSoft} ${t.buttonOutlineText} text-sm flex items-center justify-center gap-3 transition-all ${t.buttonOutlineHoverBg} active:scale-[0.98]`}
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
                className={`w-full py-4 border ${t.accentBorderSoft} ${t.buttonOutlineText} text-sm flex items-center justify-center gap-3 transition-all ${t.buttonOutlineHoverBg} active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed`}
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
                className={`w-full py-4 border ${t.accentBorderSoft} ${t.buttonOutlineText} text-sm flex items-center justify-center gap-3 transition-all ${t.buttonOutlineHoverBg} active:scale-[0.98]`}
              >
                <span className="text-lg">⚿</span>
                Continue with passkey
              </button>
            </div>

            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${t.divider}`} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className={`px-4 rounded-full ${t.bg} ${t.mutedText}`}>or</span>
              </div>
            </div>

            <div className="mb-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleEmailContinue)}
                placeholder="Email address"
                className={`w-full py-4 px-4 ${t.inputBg} border ${t.inputBorder} ${t.primaryText} text-sm ${t.placeholder} focus:outline-none ${t.inputFocusBorder} transition-colors`}
              />
            </div>

            <button
              type="button"
              onClick={handleEmailContinue}
              className={`w-full py-4 border ${t.accentBorderSoft} ${t.buttonOutlineText} text-sm transition-all ${t.buttonOutlineHoverBg} active:scale-[0.98]`}
            >
              Continue with email
            </button>

            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => handleToggleClick('initial')}
                className={`${t.secondaryText} text-sm hover:opacity-80 transition-colors`}
              >
                {togglePrompt}
              </button>
            </div>
          </>
        )}

        {step === 'password' && mode === 'signin' && (
          <>
            <div className="mb-10">
              <div className={`${t.primaryText} text-3xl font-light mb-2`}>Enter password</div>
              <div className={`${t.secondaryText} text-sm`}>{email}</div>
            </div>

            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handlePasswordContinue)}
                placeholder="Password"
                autoFocus
                className={`w-full py-4 px-4 ${t.inputBg} border ${t.inputBorder} ${t.primaryText} text-sm ${t.placeholder} focus:outline-none ${t.inputFocusBorder} transition-colors`}
              />
            </div>

            <button
              type="button"
              onClick={handlePasswordContinue}
              disabled={isLoading}
              className={`w-full py-4 ${t.buttonPrimaryBg} ${t.buttonPrimaryText} text-sm font-medium transition-all ${t.buttonPrimaryHover} active:scale-[0.98] mb-4 disabled:opacity-70 disabled:cursor-not-allowed`}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${t.divider}`} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className={`px-4 rounded-full ${t.bg} ${t.mutedText}`}>or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMagicLinkRequest}
              disabled={isLoading}
              className={`w-full py-4 border ${t.accentBorderSoft} ${t.buttonOutlineText} text-sm transition-all ${t.buttonOutlineHoverBg} active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed`}
            >
              {isLoading ? 'Sending...' : MAGIC_LINK_BUTTON_TEXT}
            </button>
            <div className={`${t.mutedText} text-xs text-center mt-3`}>
              {magicLinkSent ? 'Check your email for a magic link.' : "We'll email you a secure link"}
            </div>

            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => handleToggleClick('password')}
                className={`${t.secondaryText} text-sm hover:opacity-80 transition-colors`}
              >
                {togglePrompt}
              </button>
            </div>
          </>
        )}

        {step === 'password' && mode === 'signup' && (
          <>
            <div className="mb-10">
              <div className={`${t.primaryText} text-3xl font-light mb-2`}>Set your password</div>
              <div className={`${t.secondaryText} text-sm`}>{email}</div>
            </div>

            <div className="space-y-3 mb-6">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create password"
                autoFocus
                className={`w-full py-4 px-4 ${t.inputBg} border ${t.inputBorder} ${t.primaryText} text-sm ${t.placeholder} focus:outline-none ${t.inputFocusBorder} transition-colors`}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleCreateAccount)}
                placeholder="Confirm password"
                className={`w-full py-4 px-4 ${t.inputBg} border ${t.inputBorder} ${t.primaryText} text-sm ${t.placeholder} focus:outline-none ${t.inputFocusBorder} transition-colors`}
              />
            </div>

            <button
              type="button"
              onClick={handleCreateAccount}
              disabled={isLoading}
              className={`w-full py-4 ${t.buttonPrimaryBg} ${t.buttonPrimaryText} text-sm font-medium transition-all ${t.buttonPrimaryHover} active:scale-[0.98] mb-4 disabled:opacity-70 disabled:cursor-not-allowed`}
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${t.divider}`} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className={`px-4 rounded-full ${t.bg} ${t.mutedText}`}>or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMagicLinkRequest}
              disabled={isLoading}
              className={`w-full py-4 border ${t.accentBorderSoft} ${t.buttonOutlineText} text-sm transition-all ${t.buttonOutlineHoverBg} active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed`}
            >
              {isLoading ? 'Sending...' : MAGIC_LINK_BUTTON_TEXT}
            </button>
            <div className={`${t.mutedText} text-xs text-center mt-3`}>
              {magicLinkSent ? 'Check your email for a magic link.' : "We'll email you a secure link"}
            </div>

            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => handleToggleClick('password')}
                className={`${t.secondaryText} text-sm hover:opacity-80 transition-colors`}
              >
                {togglePrompt}
              </button>
            </div>
          </>
        )}
      </div>

      <div
        className={`px-10 pb-12 pt-8 w-full max-w-xl mx-auto transition-all duration-500 delay-200 ${
          fadeIn ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className={`${t.mutedText} text-xs text-center leading-relaxed`}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </div>

        <div className="flex justify-center mt-6">
          <div className={`w-32 h-1 rounded-full ${t.barBg}`} />
        </div>
      </div>
    </div>
  );
}
