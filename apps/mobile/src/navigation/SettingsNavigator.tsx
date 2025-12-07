import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from './types';
import SettingsMenuScreen from '../screens/settings/SettingsMenuScreen';
import ApiKeysScreen from '../screens/settings/ApiKeysScreen';
import DevicesScreen from '../screens/settings/DevicesScreen';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
      }}
    >
      <Stack.Screen
        name="SettingsMenu"
        component={SettingsMenuScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="ApiKeys"
        component={ApiKeysScreen}
        options={{ title: 'API Keys' }}
      />
      <Stack.Screen
        name="Devices"
        component={DevicesScreen}
        options={{ title: 'Devices' }}
      />
    </Stack.Navigator>
  );
}
