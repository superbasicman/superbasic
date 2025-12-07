/**
 * Navigation type definitions for React Navigation
 * Provides type-safe navigation throughout the app
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Auth Stack - Unauthenticated user flows
 */
export type AuthStackParamList = {
  Login: undefined;
  AuthCallback: {
    code?: string;
    state?: string;
    error?: string;
  };
};

/**
 * Settings Stack - Nested in Settings Tab
 */
export type SettingsStackParamList = {
  SettingsMenu: undefined;
  ApiKeys: undefined;
  Devices: undefined;
};

/**
 * Main Tabs - Authenticated user navigation
 */
export type MainTabsParamList = {
  HomeTab: undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

/**
 * Root Stack - Top-level navigator
 */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabsParamList>;
};

/**
 * Type helper for navigation props
 */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
