import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import type { RootStackParamList } from './types';

/**
 * Deep linking and web routing configuration
 * - Mobile: Deep links (superbasic://)
 * - Web: URL-based routing (http://localhost:8081, https://app.superbasic.com)
 * Maps paths like /auth/callback and /settings/api-keys to screens
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'superbasic://',
    'http://localhost:8081',
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
          HomeTab: '', // Root path (/) goes to HomeTab
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
