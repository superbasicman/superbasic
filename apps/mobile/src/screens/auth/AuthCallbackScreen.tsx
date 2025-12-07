import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';

type AuthCallbackRouteProp = RouteProp<AuthStackParamList, 'AuthCallback'>;

/**
 * AuthCallbackScreen handles OAuth deep link callbacks
 * This screen shows a loading state while the OAuth code is exchanged for tokens
 */
export default function AuthCallbackScreen() {
  const route = useRoute<AuthCallbackRouteProp>();
  const { handleDeepLink } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    processCallback();
  }, []);

  async function processCallback() {
    const { code, state, error: errorParam } = route.params || {};

    if (errorParam) {
      setError(errorParam);
      return;
    }

    if (!code) {
      setError('Authorization code missing');
      return;
    }

    // The AuthContext will handle the actual token exchange via handleDeepLink
    // This screen is just a visual placeholder during the process
    try {
      // The deep link handling is done in AuthContext
      // This screen will be automatically navigated away from once auth succeeds
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }

  if (error) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-10">
        <Text className="text-red-400 text-lg font-medium mb-2">
          Authentication Error
        </Text>
        <Text className="text-white/60 text-sm text-center">
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black items-center justify-center">
      <ActivityIndicator size="large" color="#fff" />
      <Text className="text-white/60 text-sm mt-4">
        Completing sign in...
      </Text>
    </View>
  );
}
