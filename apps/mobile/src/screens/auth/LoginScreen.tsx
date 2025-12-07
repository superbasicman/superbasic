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
      <View className="flex-1 bg-black items-center justify-center">
        <View className={`items-center ${splashVisible ? 'opacity-100' : 'opacity-0'}`}>
          <Text className="text-white text-4xl font-light tracking-tight mb-3">
            SuperBasic Finance
          </Text>
          <Text className="text-white/50 text-lg font-light">
            your finances, in plain text
          </Text>
        </View>
      </View>
    );
  }

  // Welcome Screen
  if (currentScreen === 'welcome') {
    return (
      <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom']}>
        <View className="flex-1 px-10">
          <View className="flex-1 justify-center">
            <View className="mb-16">
              <Text className="text-white/40 text-xs tracking-widest uppercase mb-6">
                Welcome to
              </Text>
              <Text className="text-white text-5xl font-light tracking-tight mb-4">
                SuperBasic Finance
              </Text>
              <Text className="text-white/50 text-lg font-light">
                your finances, in plain text
              </Text>
            </View>

            <View className="space-y-6 mb-16">
              <View className="flex-row items-center gap-4">
                <View className="w-10 h-10 border border-white/20 items-center justify-center">
                  <Text className="text-white/60 text-lg">→</Text>
                </View>
                <View>
                  <Text className="text-white text-sm">Search any transaction</Text>
                  <Text className="text-white/40 text-xs">By date or keyword</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-4">
                <View className="w-10 h-10 border border-white/20 items-center justify-center">
                  <Text className="text-white/60 text-lg">○</Text>
                </View>
                <View>
                  <Text className="text-white text-sm">Securely share</Text>
                  <Text className="text-white/40 text-xs">With friends, family, or advisors</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-4">
                <View className="w-10 h-10 border border-white/20 items-center justify-center">
                  <Text className="text-white/60 text-lg">◇</Text>
                </View>
                <View>
                  <Text className="text-white text-sm">Create custom views</Text>
                  <Text className="text-white/40 text-xs">With filters, sorts & groups</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-4">
                <View className="w-10 h-10 border border-white/20 items-center justify-center">
                  <Text className="text-white/60 text-lg">✶</Text>
                </View>
                <View>
                  <Text className="text-white text-sm">Custom budgets and goals</Text>
                  <Text className="text-white/40 text-xs">Track what matters and adjust</Text>
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
              className="w-full py-4 bg-white items-center justify-center active:opacity-90"
            >
              <Text className="text-black text-sm font-medium tracking-wide">
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
              <Text className="text-white/60 text-sm">I already have an account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Auth Screen
  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom']}>
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
              <Text className="text-white/50 text-sm">←</Text>
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
                  <Text className="text-white text-3xl font-light mb-2">
                    {mode === 'signin' ? (fromGetStarted ? 'Welcome' : 'Welcome back') : 'Create your account'}
                  </Text>
                  <Text className="text-white/40 text-sm">
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
                    className="w-full py-4 border border-white/20 items-center justify-center active:bg-white active:opacity-90"
                  >
                    <Text className="text-white text-sm">Continue with Google</Text>
                  </TouchableOpacity>
                </View>

                <View className="relative mb-8">
                  <View className="absolute inset-0 items-center justify-center">
                    <View className="w-full border-t border-white/10" />
                  </View>
                  <View className="items-center justify-center">
                    <Text className="px-4 bg-black text-white/30 text-xs">or</Text>
                  </View>
                </View>

                <View className="mb-4">
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    onSubmitEditing={handleEmailContinue}
                    placeholder="Email address"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm"
                  />
                </View>

                <TouchableOpacity
                  onPress={handleEmailContinue}
                  className="w-full py-4 border border-white/20 items-center justify-center active:bg-white active:opacity-90"
                >
                  <Text className="text-white text-sm">Continue with email</Text>
                </TouchableOpacity>

                <View className="items-center mt-8">
                  <TouchableOpacity onPress={() => handleToggleClick('initial')}>
                    <Text className="text-white/40 text-sm">{togglePrompt}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {step === 'password' && mode === 'signin' && (
              <>
                <View className="mb-10">
                  <Text className="text-white text-3xl font-light mb-2">Enter password</Text>
                  <Text className="text-white/40 text-sm">{email}</Text>
                </View>

                <View className="mb-4">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={handlePasswordContinue}
                    placeholder="Password"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    secureTextEntry
                    autoFocus
                    className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm"
                  />
                </View>

                <TouchableOpacity
                  onPress={handlePasswordContinue}
                  disabled={isLoading}
                  className="w-full py-4 bg-white items-center justify-center mb-4 active:opacity-90"
                >
                  {isLoading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text className="text-black text-sm font-medium">Sign in</Text>
                  )}
                </TouchableOpacity>

                <View className="items-center mt-8">
                  <TouchableOpacity onPress={() => handleToggleClick('password')}>
                    <Text className="text-white/40 text-sm">{togglePrompt}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {step === 'password' && mode === 'signup' && (
              <>
                <View className="mb-10">
                  <Text className="text-white text-3xl font-light mb-2">Set your password</Text>
                  <Text className="text-white/40 text-sm">{email}</Text>
                </View>

                <View className="space-y-3 mb-6">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create password"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    secureTextEntry
                    autoFocus
                    className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm"
                  />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onSubmitEditing={handlePasswordContinue}
                    placeholder="Confirm password"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    secureTextEntry
                    className="w-full py-4 px-4 bg-white/5 border border-white/10 text-white text-sm"
                  />
                </View>

                <TouchableOpacity
                  onPress={handlePasswordContinue}
                  disabled={isLoading}
                  className="w-full py-4 bg-white items-center justify-center mb-4 active:opacity-90"
                >
                  {isLoading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text className="text-black text-sm font-medium">Create account</Text>
                  )}
                </TouchableOpacity>

                <View className="items-center mt-8">
                  <TouchableOpacity onPress={() => handleToggleClick('password')}>
                    <Text className="text-white/40 text-sm">{togglePrompt}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View className="pt-8">
              <Text className="text-white/20 text-xs text-center leading-relaxed">
                By continuing, you agree to our Terms of Service and Privacy Policy
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
