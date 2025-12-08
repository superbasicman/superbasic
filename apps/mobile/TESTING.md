# Universal React Native App - Testing Guide

This guide covers testing the universal React Native app on iOS, Android, and web platforms.

## Prerequisites

### Database Setup
Ensure OAuth clients are seeded in your database:

```bash
# For local development database
pnpm db:seed --target local

# For test database
pnpm db:seed --target test
```

This creates two OAuth clients:
- `mobile-app` (redirect: `superbasic://auth/callback`)
- `web-spa` (redirect: `http://localhost:8081/auth/callback`, `https://app.superbasic.com/auth/callback`)

### API Server
Ensure the API server is running:

```bash
# Run API with local database
pnpm --filter=@repo/api dev

# Or run with test database
pnpm --filter=@repo/api dev:test
```

API should be accessible at `http://localhost:3000`

---

## Phase 9.1: iOS Simulator Testing

### Start iOS Simulator

```bash
cd apps/mobile
pnpm ios
```

This will:
1. Start Metro bundler
2. Build the iOS app
3. Launch iOS Simulator
4. Install and run the app

### Test Checklist

#### OAuth Flow
- [ ] App launches to Login screen
- [ ] Tap "Login" button
- [ ] In-app browser opens with OAuth authorization page
- [ ] Complete OAuth flow (login with credentials or use existing session)
- [ ] Browser redirects to `superbasic://auth/callback?code=...`
- [ ] App receives deep link callback
- [ ] Token exchange completes
- [ ] Home screen appears with user info

#### Navigation
- [ ] Home screen displays user email and name
- [ ] Tap "Settings" tab ’ Settings menu appears
- [ ] Tap "API Keys" ’ API Keys screen loads
- [ ] Tap "Devices" ’ Devices screen loads
- [ ] Back button navigates correctly

#### API Keys (Settings > API Keys)
- [ ] Tap "Create Token" button
- [ ] Modal appears with form fields
- [ ] Fill in token name
- [ ] Select at least one scope (e.g., read:accounts)
- [ ] Select expiration (90 days)
- [ ] Tap "Create Token"
- [ ] Token display modal shows full token (one-time display)
- [ ] Copy token to clipboard works
- [ ] Close modal ’ Token appears in list
- [ ] Pull-to-refresh updates list
- [ ] Tap token menu ’ Rename works
- [ ] Tap token menu ’ Revoke shows confirmation
- [ ] Confirm revoke ’ Token removed from list

#### Devices (Settings > Devices)
- [ ] Current device shown with "Current" badge
- [ ] Device info displays: type, IP (masked), last active
- [ ] Pull-to-refresh updates list
- [ ] Tap "Revoke" on non-current session ’ Confirmation appears
- [ ] Confirm ’ Session removed
- [ ] Tap "Revoke" on current session ’ Warning about logout
- [ ] Confirm ’ App logs out and returns to Login

#### Token Storage (iOS)
- [ ] Access token stored in Keychain (via expo-secure-store)
- [ ] Refresh token stored in Keychain
- [ ] Tokens persist after app restart
- [ ] Token refresh works automatically (check logs after 10 minutes)

#### Logout
- [ ] Tap logout on Home screen
- [ ] App returns to Login screen
- [ ] Tokens cleared from Keychain
- [ ] Attempting to access protected screens redirects to Login

---

## Phase 9.2: Android Emulator Testing

### Start Android Emulator

```bash
cd apps/mobile
pnpm android
```

This will:
1. Start Metro bundler (if not already running)
2. Build the Android app
3. Launch Android Emulator
4. Install and run the app

### Test Checklist

Same as iOS checklist above, with additional Android-specific checks:

#### Deep Linking (Android)
- [ ] Deep link `superbasic://auth/callback` handled correctly
- [ ] App can be set as default handler for `superbasic://` scheme
- [ ] Back button navigation works correctly

#### Token Storage (Android)
- [ ] Access token stored in Android Keystore
- [ ] Refresh token stored in Android Keystore
- [ ] Tokens survive app restart
- [ ] Token refresh works automatically

---

## Phase 9.3: Web Browser Testing

### Start Web Dev Server

```bash
cd apps/mobile
pnpm web
```

This will:
1. Start Metro bundler for web
2. Open browser at `http://localhost:8081`

### Test Checklist

#### OAuth Flow (Web-Specific)
- [ ] App loads at `http://localhost:8081`
- [ ] Redirects to Login screen
- [ ] Click "Login" button
- [ ] **Full-page redirect** to OAuth authorization page (not in-app browser)
- [ ] Complete OAuth flow
- [ ] Redirects to `http://localhost:8081/auth/callback?code=...&state=...`
- [ ] Token exchange completes with `credentials: 'include'`
- [ ] **Refresh token set as HttpOnly/Secure/SameSite cookie**
- [ ] URL cleans up to `http://localhost:8081/`
- [ ] Home screen appears

#### URL Routing
- [ ] Navigate to `/` ’ Home screen
- [ ] Navigate to `/settings` ’ Settings menu
- [ ] Navigate to `/settings/api-keys` ’ API Keys screen
- [ ] Navigate to `/settings/devices` ’ Devices screen
- [ ] Browser back/forward buttons work correctly
- [ ] Refresh page maintains route

#### Token Storage (Web)
- [ ] Access token stored in memory (check with DevTools ’ Application ’ Session Storage)
- [ ] Refresh token **NOT** visible to JavaScript (HttpOnly cookie)
- [ ] Check cookies in DevTools:
  - [ ] Cookie name: `refresh_token` (or similar)
  - [ ] HttpOnly: 
  - [ ] Secure:  (on HTTPS)
  - [ ] SameSite: Strict or Lax
- [ ] Access token lost on page refresh (by design - will trigger refresh flow)
- [ ] Token refresh uses cookie automatically

#### Token Refresh (Web)
- [ ] Wait for access token to expire (10 minutes) or simulate expiry
- [ ] Next API call triggers refresh
- [ ] Refresh request includes `credentials: 'include'` (sends cookie)
- [ ] New access token received
- [ ] New refresh token set via cookie rotation
- [ ] User session continues seamlessly

#### PKCE (Web)
- [ ] Verifier and state stored in sessionStorage (check DevTools)
- [ ] Values survive full-page OAuth redirect
- [ ] Values cleared after successful token exchange

#### API Keys & Devices
Same functionality as mobile, test all CRUD operations:
- [ ] Create, list, rename, revoke API keys
- [ ] View and revoke sessions
- [ ] Pull-to-refresh or reload button works

#### Responsive Design
- [ ] Test on desktop viewport (1920x1080)
- [ ] Test on tablet viewport (768x1024)
- [ ] Test on mobile viewport (375x667)
- [ ] UI adapts correctly to all sizes

---

## Common Issues & Debugging

### OAuth Flow Fails
**Symptoms:** Redirect loops, "Invalid client" errors, callback not working

**Check:**
1. OAuth clients seeded in database:
   ```bash
   psql $DATABASE_URL -c "SELECT client_id, redirect_uris FROM oauth_clients;"
   ```
2. Redirect URIs match exactly:
   - Mobile: `superbasic://auth/callback`
   - Web: `http://localhost:8081/auth/callback`
3. API server running on correct port (3000)
4. EXPO_PUBLIC_API_URL set correctly in `.env`

### Deep Links Not Working (Mobile)
**Symptoms:** App doesn't open on callback, stuck in browser

**iOS:**
1. Reset simulator: Device ’ Erase All Content and Settings
2. Rebuild app: `pnpm ios --clean`
3. Check URL scheme in `app.json`: `scheme: "superbasic"`

**Android:**
1. Clear app data: Settings ’ Apps ’ SuperBasic ’ Storage ’ Clear Data
2. Reinstall: `pnpm android --clean`
3. Check intent filters in AndroidManifest.xml

### Token Refresh Fails
**Symptoms:** "Unauthorized" errors, forced logout after 10 minutes

**Mobile:**
```bash
# Check if refresh token exists in SecureStore
# (React Native Debugger ’ Console)
import * as SecureStore from 'expo-secure-store';
await SecureStore.getItemAsync('refresh_token');
```

**Web:**
```javascript
// Check cookie in DevTools ’ Application ’ Cookies
// Look for refresh_token cookie with HttpOnly flag
document.cookie // Will NOT show HttpOnly cookies (by design)
```

**Backend:**
- Check API logs for token refresh requests
- Verify `/v1/oauth/token` endpoint accepts `grant_type=refresh_token`
- Verify cookie parsing middleware enabled

### Web OAuth Redirect Issues
**Symptoms:** OAuth redirect goes to wrong URL, CORS errors

**Check:**
1. Web client redirect URI in database:
   ```sql
   SELECT redirect_uris FROM oauth_clients WHERE client_id = 'web-spa';
   ```
2. CORS enabled for `http://localhost:8081` in API
3. `credentials: 'include'` in fetch requests (api.ts, AuthContext.tsx)
4. API `Access-Control-Allow-Credentials: true` header

### PKCE Verification Fails
**Symptoms:** "Invalid code_verifier" error

**Check:**
1. Verifier stored before redirect (sessionStorage for web, SecureStore for mobile)
2. Same verifier used in token exchange
3. Challenge method is S256 (SHA-256)
4. Platform-specific PKCE implementation:
   - Web: Uses crypto.subtle (pkce.web.ts)
   - Mobile: Uses expo-crypto (pkce.native.ts)

---

## Performance Benchmarks

### Target Metrics
- **Initial Load (Web):** < 3s on fast 3G
- **OAuth Flow:** < 5s end-to-end
- **Token Refresh:** < 500ms
- **Screen Navigation:** < 100ms
- **API Key Creation:** < 1s

### Measuring Performance

**Web:**
```bash
# Build production bundle
npx expo export --platform web

# Serve and test with Lighthouse
npm install -g serve
serve apps/mobile/dist -p 8081
# Open Chrome DevTools ’ Lighthouse ’ Run audit
```

**Mobile:**
```bash
# iOS: Instruments ’ Time Profiler
# Android: Android Studio ’ Profiler
```

---

## Phase 10 Readiness Checklist

Before proceeding to Phase 10 (Build, Deploy, Cleanup):

- [ ] All Phase 9 tests pass on iOS
- [ ] All Phase 9 tests pass on Android
- [ ] All Phase 9 tests pass on Web
- [ ] OAuth flow works on all platforms
- [ ] Token storage follows security model (auth-goal.md)
- [ ] Token refresh works on all platforms
- [ ] All screens render correctly
- [ ] No console errors or warnings
- [ ] TypeScript compilation succeeds
- [ ] Linting passes: `pnpm lint`
- [ ] Production build succeeds: `npx expo export --platform web`

---

## Next Steps

Once all tests pass:
1. Proceed to **Phase 10: Build, Deploy, Cleanup**
2. Build production web bundle
3. Deploy to hosting (Vercel/Netlify/Cloudflare)
4. Remove `apps/web/` directory
5. Update CI/CD pipelines
