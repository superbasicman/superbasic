import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState, useEffect } from 'react';
import type { RootStackParamList } from './types';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { getAccessToken, hasValidAccessToken } from '../lib/tokenStorage';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root Navigator - Switches between Auth and Main flows based on authentication state
 * This is a placeholder implementation - will be enhanced with AuthContext in Phase 4
 */
export default function RootNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  async function checkAuthState() {
    try {
      const token = await getAccessToken();
      const isValid = await hasValidAccessToken();
      setIsAuthenticated(!!token && isValid);
    } catch (error) {
      console.error('Failed to check auth state:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    // TODO: Add proper loading screen in Phase 5
    return null;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}
