# Plan: Universal App with React Native Web

## Goal
Replace the separate web app (`apps/web`) with a single React Native app (`apps/mobile`) that runs on **web, iOS, and Android** using React Native Web.

## Current State
- `apps/web`: React + Tailwind CSS (HTML elements) - **will be replaced**
- `apps/mobile`: React Native + NativeWind (Expo managed) - **becomes the universal app**
- Shared: Only `@repo/types` currently shared

## Approach: React Native Web via Expo

Expo already has built-in React Native Web support. We'll enable web as a target for the existing mobile app.

---

## Implementation Steps

### Phase 1: Enable Web in Expo Mobile App

**Files to modify:**
- `apps/mobile/package.json` - Add web dependencies
- `apps/mobile/app.json` - Configure web settings
- `apps/mobile/metro.config.js` - Ensure web compatibility

**Tasks:**
1. Install web dependencies:
   ```bash
   pnpm --filter @repo/mobile add react-dom react-native-web @expo/metro-runtime
   pnpm --filter @repo/mobile add -D @types/react-dom
   ```

2. Update `app.json` with web configuration:
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

3. Verify NativeWind works on web (it should - v4 supports RN Web)

4. Run `npx expo start --web` to test

### Phase 2: Fix Web-Specific Issues

**Potential issues to address:**
- `expo-secure-store` doesn't work on web → use localStorage fallback
- `expo-web-browser` behavior differs on web → use window.location
- Deep linking works differently on web → use window.location.href
- SafeAreaView not needed on web → conditional rendering

**Files to modify:**
- `apps/mobile/src/lib/tokenStorage.ts` - Add web fallback
- `apps/mobile/src/contexts/AuthContext.tsx` - Handle web OAuth flow
- `apps/mobile/src/navigation/linking.ts` - Web routing

**Pattern for platform-specific code:**
```typescript
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // Web-specific code
} else {
  // Native-specific code
}
```

Or use `.web.ts` / `.native.ts` file extensions for larger differences.

### Phase 3: Create Platform-Specific Adapters

**New files to create:**
```
apps/mobile/src/lib/
├── tokenStorage.ts        → tokenStorage.native.ts (SecureStore)
├── tokenStorage.web.ts    → new file (localStorage)
├── pkce.ts               → pkce.native.ts (expo-crypto)
├── pkce.web.ts           → new file (crypto.subtle)
```

**tokenStorage.web.ts example:**
```typescript
const ACCESS_TOKEN_KEY = 'sbf_access_token';
const REFRESH_TOKEN_KEY = 'sbf_refresh_token';
const EXPIRY_KEY = 'sbf_token_expires_at';

export async function saveTokens(params: {...}) {
  localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
  localStorage.setItem(EXPIRY_KEY, (Date.now() + params.expiresIn * 1000).toString());
  if (params.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
  }
}
// ... rest of interface implementation
```

### Phase 4: Update OAuth Flow for Web

**Files to modify:**
- `apps/mobile/src/contexts/AuthContext.tsx`

**Changes needed:**
- Web uses `window.location.href` for OAuth redirect (not in-app browser)
- Web uses `window.location.search` for callback params
- Web callback URL: `http://localhost:8081/auth/callback` (dev) or `https://app.superbasic.com/auth/callback` (prod)

**OAuth client registration:**
- Need to add web redirect URIs to the OAuth client in database seed
- Or use a separate `web-spa` client for web

### Phase 5: Configure Web Routing

**Files to modify:**
- `apps/mobile/src/navigation/linking.ts`
- `apps/mobile/App.tsx`

React Navigation works on web but URLs need to be configured:
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

### Phase 6: Build and Deploy Web

**Commands:**
```bash
# Development
npx expo start --web

# Production build
npx expo export --platform web

# Output in apps/mobile/dist/
```

**Deployment options:**
- Static hosting (Vercel, Netlify, Cloudflare Pages)
- Same infrastructure as current web app

### Phase 7: Remove Old Web App

**After web version is working:**
1. Update root `package.json` scripts
2. Update CI/CD pipelines
3. Delete `apps/web/` directory
4. Update any documentation

---

## Critical Files

### Files to Modify
- `apps/mobile/package.json`
- `apps/mobile/app.json`
- `apps/mobile/src/lib/tokenStorage.ts` (split into .web.ts/.native.ts)
- `apps/mobile/src/lib/pkce.ts` (split into .web.ts/.native.ts)
- `apps/mobile/src/contexts/AuthContext.tsx`
- `apps/mobile/src/navigation/linking.ts`
- `packages/database/seed.ts` (add web redirect URI)

### Files to Create
- `apps/mobile/src/lib/tokenStorage.web.ts`
- `apps/mobile/src/lib/tokenStorage.native.ts`
- `apps/mobile/src/lib/pkce.web.ts`
- `apps/mobile/src/lib/pkce.native.ts`

### Files to Delete (Phase 7)
- `apps/web/` (entire directory)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| NativeWind not working on web | Test early; fallback to inline styles or StyleSheet |
| OAuth flow differences | Platform.OS checks + separate adapter files |
| Bundle size increase | Expo's web bundler handles tree-shaking |
| Missing web features from old app | Review apps/web pages, port any missing functionality |

---

## Success Criteria

1. `npx expo start --web` runs the app in browser
2. Login flow works on web (OAuth + email/password)
3. All existing screens render correctly on web
4. Token storage persists on web (localStorage)
5. Deep links work for OAuth callback on web
6. Production build deploys successfully

---

## Estimated Effort

- Phase 1-2: Enable web + fix issues (~2-3 hours)
- Phase 3: Platform adapters (~1-2 hours)
- Phase 4-5: OAuth + routing (~2-3 hours)
- Phase 6: Build + deploy (~1 hour)
- Phase 7: Cleanup (~30 min)

**Total: ~1 day**
