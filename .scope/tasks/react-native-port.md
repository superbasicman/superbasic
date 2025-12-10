# React Native Port – Web to Mobile Migration

Port the web app (`apps/web`) to React Native using **Expo (managed)** + **NativeWind** at `apps/mobile`.

Context to review before starting:
- `apps/web/src/` (current web implementation)
- `apps/web/src/contexts/AuthContext.tsx` (OAuth 2.1/PKCE flow)
- `apps/web/src/lib/api.ts` (API client)
- `packages/types/src/` (shared types)
- `packages/design-system/` (design tokens)
- IMPORTANT: AGENTS.MD : `agent/agents.md`
- IMPORTANT: `docs/auth-migration/end-auth-goal-quickref.md` (auth architecture quick reference)

---

## Phase 1: Project Setup

- [x] 1.1 Create Expo app at `apps/mobile` using `npx create-expo-app@latest mobile --template expo-template-blank-typescript`
  - Sanity check: `cd apps/mobile && npx expo start` launches without errors

- [x] 1.2 Install core dependencies: React Navigation, NativeWind, expo-secure-store, expo-auth-session, expo-crypto, expo-linking, expo-web-browser, expo-clipboard, @tanstack/react-query
  - Sanity check: `pnpm install` succeeds, no peer dependency conflicts

- [x] 1.3 Configure NativeWind: create `tailwind.config.js`, `babel.config.js`, `metro.config.js`, `global.css` with matching color palette from `packages/design-system`
  - Sanity check: NativeWind classes render correctly in a test component

- [x] 1.4 Configure `app.json` with deep link scheme `superbasic://` for OAuth callbacks
  - Sanity check: `npx expo config` shows correct scheme configuration

- [x] 1.5 Update `package.json` to add `@repo/types: workspace:*` dependency and configure as `@repo/mobile`
  - Sanity check: Can import types from `@repo/types` in mobile app

---

## Phase 2: Shared Code Layer

- [x] 2.1 Create `apps/mobile/src/lib/tokenStorage.ts` using expo-secure-store for secure token persistence
  - Store access token with expiry (short-lived: 10 minutes)
  - Store refresh token securely (long-lived: 30 days with 14-day idle timeout)
  - Implement refresh token rotation: on each refresh, old token is replaced with new one
  - Clear both tokens on logout
  - Read `expires_in`/TTL values from server responses to avoid client-side drift from auth defaults
  - Sanity check: Tokens persist across app restarts, refresh rotation works correctly

- [x] 2.2 Create `apps/mobile/src/lib/pkce.ts` using expo-crypto for PKCE code verifier/challenge generation
  - Sanity check: Generated challenges match expected format

- [x] 2.3 Port `apps/web/src/lib/api.ts` to `apps/mobile/src/lib/api.ts`, replacing Vite env vars with Expo constants and using tokenStorage abstraction
  - Sanity check: API calls work with `EXPO_PUBLIC_API_URL` environment variable

---

## Phase 3: Navigation Structure

- [x] 3.1 Create navigation types at `apps/mobile/src/navigation/types.ts` defining AuthStack, MainTabs, SettingsStack, RootStack param lists
  - Sanity check: TypeScript compiles with proper navigation typing

- [x] 3.2 Create `RootNavigator.tsx` with auth state conditional rendering (AuthNavigator vs MainNavigator)
  - Sanity check: Navigator switches based on authentication state

- [x] 3.3 Create `AuthNavigator.tsx` with LoginScreen and AuthCallbackScreen
  - Sanity check: Can navigate between auth screens

- [x] 3.4 Create `MainNavigator.tsx` with bottom tabs (HomeTab, SettingsTab)
  - Sanity check: Tab navigation works correctly

- [x] 3.5 Create `SettingsNavigator.tsx` with SettingsMenu, ApiKeys, Devices screens
  - Sanity check: Settings stack navigation works

- [x] 3.6 Configure deep linking for `superbasic://auth/callback` to AuthCallbackScreen
  - Sanity check: Deep links route to correct screen

---

## Phase 4: Auth Context

- [x] 4.1 Port `apps/web/src/contexts/AuthContext.tsx` to `apps/mobile/src/contexts/AuthContext.tsx`
  - Replace react-router navigation with @react-navigation/native
  - Use expo-web-browser for OAuth flow
  - Use expo-linking for deep link handling
  - Use expo-secure-store for PKCE state storage
  - Change client_id to `mobile-app`
  - Change redirect_uri to `superbasic://auth/callback`
  - Implement refresh token flow per end-auth-goal.md:
    - Check access token expiry before each API call (with 60s buffer)
    - If expired, call `/v1/oauth/token` with `grant_type=refresh_token`
    - Handle refresh token rotation: replace old refresh token with new one from response
    - On refresh failure (expired/revoked), clear tokens and redirect to login
    - Store new access token with updated expiry returned by the server (no hard-coded TTLs)
  - Sanity check: OAuth flow completes, refresh rotation works, expired tokens trigger re-auth

- [x] 4.2 Port `apps/web/src/hooks/useAuthForm.ts` to `apps/mobile/src/hooks/useAuthForm.ts`
  - Sanity check: Form state management works for login/register

---

## Phase 5: Auth Screens

- [x] 5.1 Create `LoginScreen.tsx` porting multi-step flow (splash → welcome → auth) from `apps/web/src/pages/Login.tsx`
  - Use SafeAreaView, KeyboardAvoidingView
  - Convert HTML elements to RN equivalents (View, Text, TextInput, TouchableOpacity)
  - Sanity check: All auth methods work (email/password, Google OAuth, magic link)

- [x] 5.2 Create `AuthCallbackScreen.tsx` to handle OAuth deep link callback
  - Show loading state during code exchange
  - Handle errors gracefully
  - Sanity check: OAuth callback exchanges code for tokens

---

## Phase 6: Main Screens

- [x] 6.1 Create `HomeScreen.tsx` porting from `apps/web/src/pages/Home.tsx`
  - Display user info
  - Navigation to settings screens
  - Logout functionality
  - Sanity check: User data displays, navigation works

- [x] 6.2 Create `SettingsMenuScreen.tsx` (new screen for mobile navigation pattern)
  - List settings options with navigation
  - Sanity check: Can navigate to ApiKeys and Devices

---

## Phase 7: Components

- [x] 7.1 Create `Button.tsx` component with variants (primary, secondary, outline, ghost) using TouchableOpacity
  - Sanity check: All button variants render correctly

- [x] 7.2 Create `Input.tsx` component with dark/light theme support using TextInput
  - Sanity check: Input component works in forms

- [x] 7.3 Create `CreateTokenModal.tsx` using React Native Modal with pageSheet presentation
  - Port form logic from web component
  - Sanity check: Can create new API tokens

- [x] 7.4 Create `TokenDisplayModal.tsx` with expo-clipboard integration for copy functionality
  - Sanity check: Token display and copy works

- [x] 7.5 Create `RevokeTokenDialog.tsx` as confirmation dialog
  - Sanity check: Revoke confirmation works

- [x] 7.6 Create `EditTokenNameDialog.tsx` for renaming tokens
  - Sanity check: Token rename works

---

## Phase 8: Settings Screens

- [ ] 8.1 Create `ApiKeysScreen.tsx` porting from `apps/web/src/pages/Settings/ApiKeys.tsx`
  - Use FlatList instead of table
  - Card-style token items
  - Pull-to-refresh
  - Integrate all token modals
  - Handle high-risk PAT flows: surface 403 MFA-required responses and trigger MFA step-up if enforced
  - Sanity check: Full CRUD operations work

- [ ] 8.2 Create `DevicesScreen.tsx` porting from `apps/web/src/pages/Settings/Devices.tsx`
  - FlatList for sessions
  - Revoke functionality
  - Sanity check: Session list and revoke works

---

## Phase 9: Backend & Testing

- [ ] 9.1 Add mobile OAuth client to seed script at `packages/database/seed.ts`
  - client_id: `mobile-app`
  - client_type: `public` (no client secret)
  - token_endpoint_auth_method: `none` (PKCE only, no client authentication)
  - redirect_uris: `['superbasic://auth/callback']`
  - allowed_grant_types: `['authorization_code', 'refresh_token']`
  - allowed_scopes: `['openid', 'profile', 'email']` (and app scopes as needed)
  - require_pkce: `true` (mandatory for public clients per OAuth 2.1)
  - is_first_party: `true` (first-party client, no consent)
  - Sanity check: `pnpm db:seed` creates mobile client with correct security flags

- [ ] 9.2 Run seed on test database to register mobile client
  - Sanity check: Can complete OAuth flow with mobile app

- [ ] 9.3 Test full auth flow on iOS simulator
  - Sanity check: Login → OAuth → Callback → Home works

- [ ] 9.4 Test full auth flow on Android emulator
  - Sanity check: Deep linking works on Android

---

## Files to Create

```
apps/mobile/
├── app.json
├── App.tsx
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── global.css
├── package.json
├── tsconfig.json
└── src/
    ├── components/
    │   ├── Button.tsx
    │   ├── Input.tsx
    │   ├── CreateTokenModal.tsx
    │   ├── TokenDisplayModal.tsx
    │   ├── RevokeTokenDialog.tsx
    │   └── EditTokenNameDialog.tsx
    ├── contexts/
    │   └── AuthContext.tsx
    ├── hooks/
    │   └── useAuthForm.ts
    ├── lib/
    │   ├── api.ts
    │   ├── tokenStorage.ts
    │   └── pkce.ts
    ├── navigation/
    │   ├── types.ts
    │   ├── RootNavigator.tsx
    │   ├── AuthNavigator.tsx
    │   ├── MainNavigator.tsx
    │   └── SettingsNavigator.tsx
    └── screens/
        ├── auth/
        │   ├── LoginScreen.tsx
        │   └── AuthCallbackScreen.tsx
        ├── main/
        │   └── HomeScreen.tsx
        └── settings/
            ├── SettingsMenuScreen.tsx
            ├── ApiKeysScreen.tsx
            └── DevicesScreen.tsx
```

## Critical Source Files to Reference

| Purpose | Web File |
|---------|----------|
| Auth logic (420 lines) | `apps/web/src/contexts/AuthContext.tsx` |
| API client (354 lines) | `apps/web/src/lib/api.ts` |
| Login UI | `apps/web/src/pages/Login.tsx` |
| API Keys (365 lines) | `apps/web/src/pages/Settings/ApiKeys.tsx` |
| Devices | `apps/web/src/pages/Settings/Devices.tsx` |
| Token storage | `apps/web/src/lib/tokenStorage.ts` |
| PKCE utilities | `apps/web/src/lib/pkce.ts` |
| Types | `packages/types/src/` |
| Design tokens | `packages/design-system/tailwind.config.ts` |
