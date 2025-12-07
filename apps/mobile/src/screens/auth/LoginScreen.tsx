import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthForm } from '../../hooks/useAuthForm';

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

export default function LoginScreen() {
  const { loginWithGoogle, authError } = useAuth();
  const {
    email,
    password,
    confirmPassword,
    isLoading,
    error,
    setEmail,
    setPassword,
    setConfirmPassword,
    setError,
    handleLogin,
    handleRegister,
  } = useAuthForm();

  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('initial');
  const [splashVisible, setSplashVisible] = useState(false);
  const [fromGetStarted, setFromGetStarted] = useState(false);
  const [theme, setTheme] = useState<Theme>('pureDark');

  const themeOrder: Theme[] = ['pureDark', 'coffeeDark', 'pureLight', 'coffeeLight'];
  const t = palette[theme];

  const toggleTheme = () => {
    setTheme((prev) => {
      const idx = themeOrder.indexOf(prev);
      return themeOrder[(idx + 1) % themeOrder.length];
    });
  };

  // Splash intro timing
  useEffect(() => {
    const screenTimeout = setTimeout(() => setCurrentScreen('welcome'), 2000);
    return () => clearTimeout(screenTimeout);
  }, []);

  // Subtle fade for splash
  useEffect(() => {
    if (currentScreen !== 'splash') {
      setSplashVisible(false);
      return;
    }
    const fadeTimeout = setTimeout(() => setSplashVisible(true), 50);
    return () => clearTimeout(fadeTimeout);
  }, [currentScreen]);

  // Surface auth errors from provider callbacks
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

  const togglePrompt =
    mode === 'signin' && !fromGetStarted ? "Don't have an account? Sign up" : 'Already have an account? Sign in';

  const handleToggleClick = (nextStep?: Step) => {
    if (mode === 'signin' && !fromGetStarted) {
      toggleMode('signup', nextStep ?? step);
    } else {
      toggleMode('signin', nextStep ?? step, { resetGetStarted: true });
    }
  };

  // Splash Screen
  if (currentScreen === 'splash') {
    return (
      <View className={`flex-1 items-center justify-center relative ${t.bg}`}>
        <TouchableOpacity
          onPress={toggleTheme}
          className={`absolute top-6 right-6 w-7 h-7 rounded-full border ${t.toggleBorder} ${t.toggleBg}`}
        />
        <View className={`items-center ${splashVisible ? 'opacity-100' : 'opacity-0'}`}>
          <Text className={`${t.primaryText} text-4xl font-light tracking-tight mb-3`}>
            SuperBasic Finance
          </Text>
          <Text className={`${t.primarySoft} text-lg font-light`}>
            your finances, in plain text
          </Text>
          <View className="mt-3">
            <View className={`w-10 h-[2px] rounded-full ${t.barBg}`} />
          </View>
        </View>
      </View>
    );
  }

  // Welcome Screen
  if (currentScreen === 'welcome') {
    return (
      <SafeAreaView className={`flex-1 relative ${t.bg}`} edges={['top', 'bottom']}>
        <TouchableOpacity
          onPress={toggleTheme}
          className={`absolute top-6 right-6 w-7 h-7 rounded-full border ${t.toggleBorder} ${t.toggleBg}`}
        />
        <View className="flex-1 px-10">
          <View className="flex-1 justify-center">
            <View className="mb-16">
              <Text className={`${t.secondaryText} text-xs tracking-widest uppercase mb-6`}>
                Welcome to
              </Text>
              <Text className={`${t.primaryText} text-5xl font-light tracking-tight mb-4`}>
                SuperBasic Finance
              </Text>
              <Text className={`${t.primarySoft} text-lg font-light`}>
                your finances, in plain text
              </Text>
            </View>

            <View className="space-y-6 mb-16">
              <View className="flex-row items-center gap-4">
                <View className={`w-10 h-10 border rounded-full items-center justify-center ${t.accentBorderSoft} ${t.chipBg}`}>
                  <Text className={`${t.chipIcon} text-lg`}>→</Text>
                </View>
                <View>
                  <Text className={`${t.primaryText} text-sm`}>Search any transaction</Text>
                  <Text className={`${t.secondaryText} text-xs`}>By date or keyword</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-4">
                <View className={`w-10 h-10 border rounded-full items-center justify-center ${t.accentBorderSoft} ${t.chipBg}`}>
                  <Text className={`${t.chipIcon} text-lg`}>○</Text>
                </View>
                <View>
                  <Text className={`${t.primaryText} text-sm`}>Securely share</Text>
                  <Text className={`${t.secondaryText} text-xs`}>With friends, family, or advisors</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-4">
                <View className={`w-10 h-10 border rounded-full items-center justify-center ${t.accentBorderSoft} ${t.chipBg}`}>
                  <Text className={`${t.chipIcon} text-lg`}>◇</Text>
                </View>
                <View>
                  <Text className={`${t.primaryText} text-sm`}>Create custom views</Text>
                  <Text className={`${t.secondaryText} text-xs`}>With filters, sorts & groups</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-4">
                <View className={`w-10 h-10 border rounded-full items-center justify-center ${t.accentBorderSoft} ${t.chipBg}`}>
                  <Text className={`${t.chipIcon} text-lg`}>✶</Text>
                </View>
                <View>
                  <Text className={`${t.primaryText} text-sm`}>Custom budgets and goals</Text>
                  <Text className={`${t.secondaryText} text-xs`}>Track what matters and adjust</Text>
                </View>
              </View>
            </View>
          </View>

          <View className="pb-12">
            <TouchableOpacity
              onPress={() => {
                setFromGetStarted(true);
                setMode('signup');
                setCurrentScreen('auth');
                setStep('initial');
              }}
              className={`w-full py-4 items-center justify-center active:opacity-90 ${t.buttonPrimaryBg}`}
            >
              <Text className={`${t.buttonPrimaryText} text-sm font-medium tracking-wide`}>
                Get started
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMode('signin');
                setFromGetStarted(false);
                setCurrentScreen('auth');
              }}
              className="w-full py-4 items-center justify-center mt-3"
            >
              <Text className={`${t.secondaryText} text-sm`}>I already have an account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Auth Screen
  return (
    <SafeAreaView className={`flex-1 relative ${t.bg}`} edges={['top', 'bottom']}>
      <TouchableOpacity
        onPress={toggleTheme}
        className={`absolute top-6 right-6 w-7 h-7 rounded-full border ${t.toggleBorder} ${t.toggleBg}`}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="px-6 pt-14 pb-6">
            <TouchableOpacity
              onPress={step === 'initial' ? () => {
                setFromGetStarted(false);
                setCurrentScreen('welcome');
              } : handleBack}
              className="flex-row items-center gap-2"
            >
              <Text className={`${t.secondaryText} text-sm`}>←</Text>
            </TouchableOpacity>
          </View>

          <View className="px-10 pb-12">
            {error && (
              <View className="mb-6 p-4 border border-red-400 bg-red-500/10">
                <Text className="text-red-300">{error}</Text>
              </View>
            )}

            {step === 'initial' && (
              <>
                <View className="mb-10">
                  <Text className={`${t.primaryText} text-3xl font-light mb-2`}>
                    {mode === 'signin' ? (fromGetStarted ? 'Welcome' : 'Welcome back') : 'Create your account'}
                  </Text>
                  <Text className={`${t.secondaryText} text-sm`}>
                    {mode === 'signin' ? 'Sign in to continue' : 'Join SuperBasic today'}
                  </Text>
                </View>

                <View className="space-y-3 mb-8">
                  <TouchableOpacity
                    onPress={() => {
                      setError(null);
                      void loginWithGoogle();
                    }}
                    disabled={isLoading}
                    className={`w-full py-4 border items-center justify-center active:opacity-90 ${t.accentBorderSoft}`}
                  >
                    <Text className={`${t.buttonOutlineText} text-sm`}>Continue with Google</Text>
                  </TouchableOpacity>
                </View>

                <View className="relative mb-8">
                  <View className="absolute inset-0 items-center justify-center">
                    <View className={`w-full border-t ${t.divider}`} />
                  </View>
                  <View className="items-center justify-center">
                    <Text className={`px-4 text-xs ${t.bg} ${t.mutedText}`}>or</Text>
                  </View>
                </View>

                <View className="mb-4">
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    onSubmitEditing={handleEmailContinue}
                    placeholder="Email address"
                    placeholderTextColor="rgba(156,163,175,0.9)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className={`w-full py-4 px-4 text-sm ${t.inputBg} border ${t.inputBorder} ${t.primaryText}`}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleEmailContinue}
                  className={`w-full py-4 border items-center justify-center active:opacity-90 ${t.accentBorderSoft}`}
                >
                  <Text className={`${t.buttonOutlineText} text-sm`}>Continue with email</Text>
                </TouchableOpacity>

                <View className="items-center mt-8">
                  <TouchableOpacity onPress={() => handleToggleClick('initial')}>
                    <Text className={`${t.secondaryText} text-sm`}>{togglePrompt}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {step === 'password' && mode === 'signin' && (
              <>
                <View className="mb-10">
                  <Text className={`${t.primaryText} text-3xl font-light mb-2`}>Enter password</Text>
                  <Text className={`${t.secondaryText} text-sm`}>{email}</Text>
                </View>

                <View className="mb-4">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={handlePasswordContinue}
                    placeholder="Password"
                    placeholderTextColor="rgba(156,163,175,0.9)"
                    secureTextEntry
                    autoFocus
                    className={`w-full py-4 px-4 text-sm ${t.inputBg} border ${t.inputBorder} ${t.primaryText}`}
                  />
                </View>

                <TouchableOpacity
                  onPress={handlePasswordContinue}
                  disabled={isLoading}
                  className={`w-full py-4 items-center justify-center mb-4 active:opacity-90 ${t.buttonPrimaryBg}`}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text className={`${t.buttonPrimaryText} text-sm font-medium`}>Sign in</Text>
                  )}
                </TouchableOpacity>

                <View className="items-center mt-8">
                  <TouchableOpacity onPress={() => handleToggleClick('password')}>
                    <Text className={`${t.secondaryText} text-sm`}>{togglePrompt}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {step === 'password' && mode === 'signup' && (
              <>
                <View className="mb-10">
                  <Text className={`${t.primaryText} text-3xl font-light mb-2`}>Set your password</Text>
                  <Text className={`${t.secondaryText} text-sm`}>{email}</Text>
                </View>

                <View className="space-y-3 mb-6">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create password"
                    placeholderTextColor="rgba(156,163,175,0.9)"
                    secureTextEntry
                    autoFocus
                    className={`w-full py-4 px-4 text-sm ${t.inputBg} border ${t.inputBorder} ${t.primaryText}`}
                  />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onSubmitEditing={handlePasswordContinue}
                    placeholder="Confirm password"
                    placeholderTextColor="rgba(156,163,175,0.9)"
                    secureTextEntry
                    className={`w-full py-4 px-4 text-sm ${t.inputBg} border ${t.inputBorder} ${t.primaryText}`}
                  />
                </View>

                <TouchableOpacity
                  onPress={handlePasswordContinue}
                  disabled={isLoading}
                  className={`w-full py-4 items-center justify-center mb-4 active:opacity-90 ${t.buttonPrimaryBg}`}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text className={`${t.buttonPrimaryText} text-sm font-medium`}>Create account</Text>
                  )}
                </TouchableOpacity>

                <View className="items-center mt-8">
                  <TouchableOpacity onPress={() => handleToggleClick('password')}>
                    <Text className={`${t.secondaryText} text-sm`}>{togglePrompt}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View className="pt-8">
              <Text className={`${t.mutedText} text-xs text-center leading-relaxed`}>
                By continuing, you agree to our Terms of Service and Privacy Policy
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
