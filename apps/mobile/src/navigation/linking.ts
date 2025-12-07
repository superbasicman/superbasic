import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import type { RootStackParamList } from './types';

/**
 * Deep linking configuration for OAuth callbacks
 * Maps superbasic://auth/callback to AuthCallbackScreen
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'superbasic://',
    'https://app.superbasic.com',
  ],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          AuthCallback: 'auth/callback',
        },
      },
      Main: {
        screens: {
          HomeTab: 'home',
          SettingsTab: {
            screens: {
              SettingsMenu: 'settings',
              ApiKeys: 'settings/api-keys',
              Devices: 'settings/devices',
            },
          },
        },
      },
    },
  },
};
