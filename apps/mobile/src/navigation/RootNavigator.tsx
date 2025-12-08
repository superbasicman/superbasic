import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { useAuth } from '../contexts/AuthContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root Navigator - Switches between Auth and Main flows based on authentication state
 * Uses AuthContext so OAuth/email-password flows can flip the stack after tokens are issued.
 */
export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

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
