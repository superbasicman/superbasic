# Universal React Native App

Build a single React Native app (`apps/mobile`) that runs on **web, iOS, and Android** using Expo + NativeWind + React Native Web.

**Prerequisite:** Phases 1-5 of the original mobile port are complete (project setup, shared code layer, navigation, auth context, auth screens). See `react-native-port.md` for completed work.

IMPORTANT: ALL code implementation must align with `docs/auth-migration/end-auth-goal.md`
IMPORTANT: ALL code must align with `agent/agents.md`
---

## Phase 1: Seed OAuth Clients

Register both mobile and web OAuth clients to unblock testing on all platforms.

- [x] 1.1 Add `mobile-app` OAuth client to `packages/database/seed.ts`
  - client_id: `mobile-app`
  - client_type: `public`
  - token_endpoint_auth_method: `none`
  - redirect_uris: `['superbasic://auth/callback']`
  - allowed_grant_types: `['authorization_code', 'refresh_token']`
  - allowed_scopes: `['openid', 'profile', 'email', 'read:accounts', 'write:accounts', 'read:transactions', 'write:transactions', 'manage:members', 'admin']`
  - require_pkce: `true` (enforced in application logic)
  - is_first_party: `true`
  - Sanity check: Client appears in database after seed ✅

- [x] 1.2 Add `web-spa` OAuth client to `packages/database/seed.ts`
  - client_id: `web-spa`
  - client_type: `public`
  - token_endpoint_auth_method: `none`
  - redirect_uris: `['http://localhost:8081/auth/callback', 'https://app.superbasic.com/auth/callback']`
  - allowed_grant_types: `['authorization_code', 'refresh_token']`
  - allowed_scopes: `['openid', 'profile', 'email', 'read:accounts', 'write:accounts', 'read:transactions', 'write:transactions', 'manage:members', 'admin']`
  - require_pkce: `true` (enforced in application logic)
  - is_first_party: `true`
  - Sanity check: Client appears in database after seed ✅

- [x] 1.3 Run seed on local and test databases
  ```bash
  pnpm db:seed --target local
  pnpm db:seed --target test
  ```
  - Sanity check: Both clients registered successfully ✅

---

## Phase 2: Enable Web in Expo

- [x] 2.1 Install web dependencies
  ```bash
  pnpm --filter @repo/mobile add react-dom react-native-web @expo/metro-runtime
  pnpm --filter @repo/mobile add -D @types/react-dom
  ```
  - Sanity check: `pnpm install` succeeds ✅

- [x] 2.2 Update `app.json` with web configuration
  ```json
  {
    "expo": {
      "web": {
        "bundler": "metro",
        "output": "single",
        "favicon": "./assets/favicon.png"
      }
    }
  }
  ```
  - Sanity check: `npx expo config` shows web settings ✅

- [x] 2.3 Test web build launches
  - Sanity check: `pnpm --filter @repo/mobile exec expo start --web` loads without module errors ✅

---

## Phase 3: Platform-Specific Adapters

Per `end-auth-goal.md` section 5.2:
- **Web:** Access token in memory, refresh token in HttpOnly/Secure cookie
- **Mobile:** Both tokens in secure OS storage (Keychain/Keystore)

- [x] 3.1 Rename `tokenStorage.ts` to `tokenStorage.native.ts` (current SecureStore implementation)
  - Sanity check: Native builds still work ✅
  - Created `tokenStorage.ts` as platform-agnostic entry point for TypeScript

- [x] 3.2 Create `tokenStorage.web.ts` with memory-only access token storage
  ```typescript
  let inMemoryAccessToken: string | null = null;
  let inMemoryExpiry: number | null = null;

  export async function saveTokens(params: {
    accessToken: string;
    expiresIn: number;
    refreshToken?: string; // Ignored - server sets HttpOnly cookie
  }) {
    inMemoryAccessToken = params.accessToken;
    inMemoryExpiry = Date.now() + params.expiresIn * 1000;
  }

  export async function getAccessToken(): Promise<string | null> {
    return inMemoryAccessToken;
  }

  export async function getRefreshToken(): Promise<string | null> {
    return null; // HttpOnly cookie, not accessible to JS
  }

  export async function clearTokens() {
    inMemoryAccessToken = null;
    inMemoryExpiry = null;
  }
  ```
  Notes: Refresh cookie must be HttpOnly, Secure, and SameSite per auth-goal 5.2.
  - Sanity check: Web build compiles ✅

- [x] 3.3 Rename `pkce.ts` to `pkce.native.ts` (current expo-crypto implementation)
  - Sanity check: Native builds still work ✅
  - Created `pkce.ts` as platform-agnostic entry point for TypeScript

- [x] 3.4 Create `pkce.web.ts` using crypto.subtle
  - Sanity check: Web build compiles, PKCE generates valid challenges ✅
  - Uses Web Crypto API for cryptographically secure random generation

- [x] 3.5 Verify TypeScript compiles for both platforms
  - Sanity check: `pnpm --filter @repo/mobile exec tsc --noEmit` passes ✅

---

## Phase 4: Main Screens

- [x] 4.1 Create `HomeScreen.tsx` porting from `apps/web/src/pages/Home.tsx`
  - Display user info ✅
  - Navigation to settings ✅
  - Logout functionality ✅
  - Sanity check: User data displays, navigation works ✅
  - Features: Loading state, user info card, navigation buttons, logout handler

- [x] 4.2 Create `SettingsMenuScreen.tsx` for mobile navigation pattern
  - List settings options with navigation links ✅
  - Sanity check: Can navigate to ApiKeys and Devices ✅
  - Features: Settings list with icons, descriptions, and navigation handlers

---

## Phase 5: Components

- [x] 5.1 Create `Button.tsx` with variants (primary, secondary, outline, ghost)
  - Use TouchableOpacity/Pressable ✅
  - Sanity check: All variants render correctly ✅
  - Features: Loading state, disabled state, fullWidth option, active opacity

- [x] 5.2 Create `Input.tsx` with dark/light theme support
  - Sanity check: Input works in forms ✅
  - Features: Label, error/helper text, focus state, theme-aware styling

- [x] 5.3 Create `CreateTokenModal.tsx` using React Native Modal
  - Port form logic from web ✅
  - Sanity check: Can create new API tokens ✅
  - Features: Form validation, loading state, keyboard handling, info message

- [x] 5.4 Create `TokenDisplayModal.tsx` with expo-clipboard integration
  - Sanity check: Token display and copy works ✅
  - Features: Clipboard copy, copy feedback, usage instructions, security warning

- [x] 5.5 Create `RevokeTokenDialog.tsx` as confirmation dialog
  - Sanity check: Revoke confirmation works ✅
  - Features: Warning icon, confirmation message, loading state, destructive action styling

- [x] 5.6 Create `EditTokenNameDialog.tsx` for renaming tokens
  - Sanity check: Token rename works ✅
  - Features: Form validation, keyboard handling, auto-focus, change detection

---

## Phase 6: Settings Screens

- [ ] 6.1 Create `ApiKeysScreen.tsx` porting from `apps/web/src/pages/Settings/ApiKeys.tsx`
  - Use FlatList instead of table
  - Card-style token items
  - Pull-to-refresh
  - Integrate all token modals
  - Sanity check: Full CRUD operations work

- [ ] 6.2 Create `DevicesScreen.tsx` porting from `apps/web/src/pages/Settings/Devices.tsx`
  - FlatList for sessions
  - Revoke functionality
  - Sanity check: Session list and revoke works

---

## Phase 7: Web OAuth Flow

Per `end-auth-goal.md` sections 5.2 and 5.7:
- Require PKCE for all clients
- Validate redirect_uri strictly (exact match)
- Authorization code flow only (no implicit grant)

| Aspect | Mobile (Native) | Web |
|--------|-----------------|-----|
| OAuth redirect | In-app browser (expo-web-browser) | `window.location.href` |
| Callback | Deep link (`superbasic://auth/callback`) | URL path (`/auth/callback`) |
| Token endpoint | `/v1/oauth/token` with refresh_token in body | `/v1/oauth/token` with `credentials: 'include'` + CSRF header |
| Token response | access_token + refresh_token in JSON body | access_token in JSON body; refresh_token via HttpOnly/Secure/SameSite `Set-Cookie` |
| Refresh token | SecureStore | HttpOnly/Secure/SameSite cookie |
| PKCE | expo-crypto | crypto.subtle |

- [ ] 7.1 Update `AuthContext.tsx` with platform-specific OAuth flow
  - Web: Full-page redirect for OAuth (not in-app browser)
  - Web: Use sessionStorage for PKCE verifier/state (survives redirect)
  - Web: Exchange code with `credentials: 'include'`; server returns access_token in body and sets refresh_token via HttpOnly/Secure/SameSite `Set-Cookie`
  - Sanity check: Web login redirects to OAuth, callback exchanges code

- [ ] 7.2 Update API client for platform-specific token refresh
  - Web: `/v1/oauth/token` with `credentials: 'include'`, CSRF header, and refresh rotation matching auth-goal semantics
    - Include `X-CSRF-Token` header (or equivalent double-submit cookie) for cookie-based refresh
  - Mobile: `/v1/oauth/token` with refresh_token in body
  - Sanity check: Token refresh works on both platforms

---

## Phase 8: Web Routing

- [ ] 8.1 Update `linking.ts` with web URL prefixes
  ```typescript
  export const linking = {
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
            HomeTab: '',
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
  ```
  - Sanity check: Visiting `/auth/callback?code=stub` hits AuthCallback screen on web

---

## Phase 9: Testing

- [ ] 9.1 Test full auth flow on iOS simulator
  - Sanity check: Login -> OAuth -> Callback -> Home works

- [ ] 9.2 Test full auth flow on Android emulator
  - Sanity check: Deep linking works on Android

- [ ] 9.3 Test full auth flow on web browser
  - Sanity check: Login -> OAuth redirect -> Callback -> Home works
  - Sanity check: Token refresh via cookie works

---

## Phase 10: Build, Deploy, Cleanup

- [ ] 10.1 Build web bundle
  ```bash
  npx expo export --platform web
  ```
  - Sanity check: Output in `apps/mobile/dist/`

- [ ] 10.2 Deploy web to hosting (Vercel/Netlify/Cloudflare)
  - Sanity check: Production URL loads and auth works

- [ ] 10.3 Remove `apps/web/` directory
  - Update root `package.json` scripts
  - Update CI/CD pipelines
  - Sanity check: All builds pass without `apps/web` references

---

## Critical Files

### Files to Modify
- `packages/database/seed.ts` - Add mobile-app + web-spa OAuth clients
- `apps/mobile/package.json` - Add react-dom, react-native-web
- `apps/mobile/app.json` - Web bundler configuration
- `apps/mobile/src/contexts/AuthContext.tsx` - Platform-specific OAuth flow
- `apps/mobile/src/lib/api.ts` - Platform-specific token refresh
- `apps/mobile/src/navigation/linking.ts` - Web URL prefixes

### Files to Create
- `apps/mobile/src/lib/tokenStorage.web.ts` - Memory-only access token
- `apps/mobile/src/lib/tokenStorage.native.ts` - SecureStore (renamed)
- `apps/mobile/src/lib/pkce.web.ts` - crypto.subtle
- `apps/mobile/src/lib/pkce.native.ts` - expo-crypto (renamed)
- `apps/mobile/src/screens/main/HomeScreen.tsx`
- `apps/mobile/src/screens/settings/SettingsMenuScreen.tsx`
- `apps/mobile/src/screens/settings/ApiKeysScreen.tsx`
- `apps/mobile/src/screens/settings/DevicesScreen.tsx`
- `apps/mobile/src/components/Button.tsx`
- `apps/mobile/src/components/Input.tsx`
- `apps/mobile/src/components/CreateTokenModal.tsx`
- `apps/mobile/src/components/TokenDisplayModal.tsx`
- `apps/mobile/src/components/RevokeTokenDialog.tsx`
- `apps/mobile/src/components/EditTokenNameDialog.tsx`

### Files to Delete (Phase 10)
- `apps/web/` (entire directory after verification)

---

## Success Criteria

1. `npx expo start --web` runs the app in browser
2. Auth flow works on all platforms (iOS, Android, web) with PKCE
3. Token storage follows auth-goal security model:
   - Web: Access token in memory, refresh token in HttpOnly/Secure/SameSite cookie (sent with credentials + CSRF header)
   - Mobile: Both tokens in secure OS storage
4. All screens render correctly on all platforms
5. Token CRUD operations work (create, view, revoke, rename)
6. Production web build deploys successfully

---

## Source Files to Reference

| Purpose | Web File |
|---------|----------|
| Auth logic | `apps/web/src/contexts/AuthContext.tsx` |
| API client | `apps/web/src/lib/api.ts` |
| Login UI | `apps/web/src/pages/Login.tsx` |
| API Keys | `apps/web/src/pages/Settings/ApiKeys.tsx` |
| Devices | `apps/web/src/pages/Settings/Devices.tsx` |
| Token storage | `apps/web/src/lib/tokenStorage.ts` |
| PKCE utilities | `apps/web/src/lib/pkce.ts` |
| Types | `packages/types/src/` |
| Design tokens | `packages/design-system/tailwind.config.ts` |
