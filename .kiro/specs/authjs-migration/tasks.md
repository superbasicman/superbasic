# Phase 2.1: Full Auth.js Migration - Tasks

## Task Overview

Total: 32 tasks across 5 sub-phases
Estimated Duration: 3 weeks

**Architecture Note**: Web client remains a thin REST consumer. Auth.js lives entirely in API tier. No `@auth/react` dependency - preserves API-first architecture and Capacitor compatibility.

## Sub-Phase 1: Auth.js Handler Integration (Week 1, Days 1-3)

### Task 1: Install Auth.js Hono Adapter

**Status**: ✅ Complete
**Priority**: P0 (Critical)
**Estimated Time**: 30 minutes
**Dependencies**: None

**Description**: Install `@auth/hono` package for Auth.js integration with Hono.

**Implementation Note**: The `@auth/hono` package does not exist in npm. Instead, we're using `@auth/core` (v0.37.4) which is already installed and provides the framework-agnostic `Auth()` function that works with Hono's Web standard Request/Response APIs.

**Steps**:
1. ~~Run `pnpm add @auth/hono --filter=@repo/api`~~ (Package doesn't exist)
2. ✅ Verified `@auth/core` v0.37.4 installed in `apps/api/package.json`
3. ✅ No additional installation needed
4. ✅ No dependency conflicts

**Acceptance Criteria**:
- [x] Auth.js core package available (`@auth/core` v0.37.4)
- [x] No dependency conflicts
- [x] Dependencies verified (pre-existing TypeScript errors are unrelated)

---

### Task 2: Create Auth.js Handler File

**Status**: ✅ Complete
**Priority**: P0 (Critical)
**Estimated Time**: 1 hour
**Dependencies**: Task 1

**Description**: Create new file to configure and export Auth.js handler.

**Implementation Note**: Created custom Hono integration using `Auth()` function from `@auth/core` since `@auth/hono` package doesn't exist. The handler wraps Auth.js to work with Hono's Web standard Request/Response APIs.

**Steps**:
1. ✅ Created `apps/api/src/auth.ts`
2. ✅ Imported `Auth` function from `@auth/core`
3. ✅ Imported `authConfig` from `@repo/auth`
4. ✅ Created Hono app instance
5. ✅ Mounted Auth.js handler at `/*` using `authApp.all('/*', ...)`
6. ✅ Exported `authApp`

**Acceptance Criteria**:
- [x] File created at `apps/api/src/auth.ts`
- [x] Auth.js handler configured using `Auth()` from `@auth/core`
- [x] No TypeScript errors
- [x] File exports `authApp`

---

### Task 3: Mount Auth.js Handler in Main App

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 30 minutes
**Dependencies**: Task 2

**Description**: Integrate Auth.js handler into main Hono app.

**Steps**:
1. Open `apps/api/src/app.ts`
2. Import `authApp` from `./auth.js`
3. Mount at `/v1/auth` using `app.route()`
4. Ensure mounted before existing routes
5. Test handler responds to `/v1/auth/signin`

**Acceptance Criteria**:
- [ ] Auth.js handler mounted at `/v1/auth`
- [ ] Handler responds to requests
- [ ] Existing routes still functional
- [ ] No route conflicts

---

### Task 4: Test Auth.js Handler with Credentials Provider

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 2 hours
**Dependencies**: Task 3

**Description**: Verify Auth.js handler works with existing Credentials provider.

**Steps**:
1. Start dev server: `pnpm dev --filter=@repo/api`
2. Test POST `/v1/auth/signin/credentials` with valid credentials
3. Verify session cookie set
4. Test GET `/v1/auth/session` returns user data
5. Test POST `/v1/auth/signout` clears session
6. Compare session format with custom routes

**Acceptance Criteria**:
- [ ] Credentials sign-in works via Auth.js handler
- [ ] Session cookie set correctly
- [ ] Session data matches expected format
- [ ] Sign-out clears session
- [ ] Session format compatible with existing middleware

---

### Task 5: Update Environment Variables

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 15 minutes
**Dependencies**: None

**Description**: Add placeholder environment variables for OAuth and email providers.

**Steps**:
1. Update `apps/api/.env.example` with new variables
2. Add to `apps/api/.env.local` (with placeholder values)
3. Document required variables in README

**Acceptance Criteria**:
- [ ] `.env.example` updated
- [ ] `.env.local` has placeholders
- [ ] Variables documented

**Environment Variables**:
```bash
# OAuth Providers
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Email Provider (for magic links)
EMAIL_SERVER=smtp://username:password@smtp.example.com:587
EMAIL_FROM=noreply@superbasicfinance.com
```

---

## Sub-Phase 2: OAuth Provider Setup (Week 1, Days 4-7)

### Task 6: Register Google OAuth App

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 1 hour
**Dependencies**: None

**Description**: Create OAuth app in Google Cloud Console.

**Steps**:
1. Go to Google Cloud Console
2. Create new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/v1/auth/callback/google`
6. Copy client ID and secret
7. Add to `.env.local`

**Acceptance Criteria**:
- [ ] Google OAuth app created
- [ ] Client ID and secret obtained
- [ ] Redirect URI configured
- [ ] Credentials added to `.env.local`

---

### Task 7: Register GitHub OAuth App

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 30 minutes
**Dependencies**: None

**Description**: Create OAuth app in GitHub.

**Steps**:
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Set callback URL: `http://localhost:3000/v1/auth/callback/github`
4. Copy client ID and generate client secret
5. Add to `.env.local`

**Acceptance Criteria**:
- [ ] GitHub OAuth app created
- [ ] Client ID and secret obtained
- [ ] Callback URL configured
- [ ] Credentials added to `.env.local`

---

### Task 8: Add OAuth Providers to Auth.js Config

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 1 hour
**Dependencies**: Task 6, Task 7

**Description**: Configure Google and GitHub providers in Auth.js config.

**Steps**:
1. Open `packages/auth/src/config.ts`
2. Import `Google` and `GitHub` providers from `@auth/core/providers`
3. Add providers to `providers` array
4. Configure `allowDangerousEmailAccountLinking: true`
5. Test configuration loads without errors

**Acceptance Criteria**:
- [ ] Google provider added to config
- [ ] GitHub provider added to config
- [ ] Email account linking enabled
- [ ] No TypeScript errors
- [ ] Config builds successfully
- [ ] Code comments/documentation note how to append future providers (e.g., Apple) without additional refactor

---

### Task 9: Create Profile Creation Helper

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 1 hour
**Dependencies**: None

**Description**: Create helper function to ensure profile exists for OAuth users.

**Steps**:
1. Create `packages/auth/src/profile.ts`
2. Implement `ensureProfileExists(userId)` function
3. Check if profile exists
4. Create profile if missing
5. Export function
6. Add to `packages/auth/src/index.ts` exports

**Acceptance Criteria**:
- [ ] File created at `packages/auth/src/profile.ts`
- [ ] Function checks for existing profile
- [ ] Function creates profile if missing
- [ ] Function exported from package
- [ ] Unit tests added

---

### Task 10: Add signIn Callback for Profile Creation

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 30 minutes
**Dependencies**: Task 9

**Description**: Update Auth.js config to create profiles for OAuth users.

**Steps**:
1. Open `packages/auth/src/config.ts`
2. Add `signIn` callback to `callbacks` object
3. Call `ensureProfileExists(user.id)` for OAuth sign-ins
4. Return `true` to allow sign-in

**Acceptance Criteria**:
- [ ] `signIn` callback added
- [ ] Profile created for new OAuth users
- [ ] Existing users not affected
- [ ] Callback doesn't block sign-in

---

### Task 11: Test Google OAuth Flow

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 2 hours
**Dependencies**: Task 8, Task 10

**Description**: End-to-end test of Google OAuth authentication.

**Steps**:
1. Start dev server
2. Navigate to `/v1/auth/signin/google`
3. Complete Google consent flow
4. Verify redirect to callback URL
5. Verify session cookie set
6. Verify user and profile created in database
7. Verify account record created in `accounts` table

**Acceptance Criteria**:
- [ ] OAuth flow completes successfully
- [ ] User redirected back to app
- [ ] Session cookie set
- [ ] User record created
- [ ] Profile record created
- [ ] Account record created with Google provider

---

### Task 12: Test GitHub OAuth Flow

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 1 hour
**Dependencies**: Task 8, Task 10

**Description**: End-to-end test of GitHub OAuth authentication.

**Steps**:
1. Start dev server
2. Navigate to `/v1/auth/signin/github`
3. Complete GitHub authorization flow
4. Verify redirect to callback URL
5. Verify session cookie set
6. Verify user and profile created in database
7. Verify account record created in `accounts` table

**Acceptance Criteria**:
- [ ] OAuth flow completes successfully
- [ ] User redirected back to app
- [ ] Session cookie set
- [ ] User record created
- [ ] Profile record created
- [ ] Account record created with GitHub provider

---

### Task 13: Test OAuth Account Linking

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 1 hour
**Dependencies**: Task 11, Task 12

**Description**: Verify OAuth accounts link to existing users by email.

**Steps**:
1. Create user with email/password
2. Sign in with Google using same email
3. Verify Google account linked to existing user
4. Verify no duplicate user created
5. Verify user can sign in with either method

**Acceptance Criteria**:
- [ ] OAuth account linked to existing user
- [ ] No duplicate user created
- [ ] Both auth methods work
- [ ] Profile data preserved

---

## Sub-Phase 3: Magic Link Setup (Week 2, Days 1-3)

### Task 14: Choose and Configure Email Service

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: None

**Description**: Select email service and configure SMTP settings.

**Steps**:
1. Evaluate options: SendGrid, Postmark, Resend
2. Create account with chosen service
3. Obtain SMTP credentials
4. Add credentials to `.env.local`
5. Test SMTP connection

**Acceptance Criteria**:
- [ ] Email service account created
- [ ] SMTP credentials obtained
- [ ] Credentials added to `.env.local`
- [ ] Test email sent successfully

**Recommendation**: Resend (best pricing, modern API)

---

### Task 15: Add Email Provider to Auth.js Config

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 1 hour
**Dependencies**: Task 14

**Description**: Configure Email provider for magic links.

**Steps**:
1. Open `packages/auth/src/config.ts`
2. Import `Email` provider from `@auth/core/providers/email`
3. Add Email provider to `providers` array
4. Configure `server` and `from` options
5. Test configuration loads without errors

**Acceptance Criteria**:
- [ ] Email provider added to config
- [ ] SMTP server configured
- [ ] From address configured
- [ ] No TypeScript errors

---

### Task 16: Create Magic Link Email Template

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: None

**Description**: Design and implement email template for magic links.

**Steps**:
1. Create plain text email template
2. Include magic link button
3. Include plain text link (for email clients without HTML)
4. Add expiration notice (24 hours)
5. Add support contact information
6. Test template rendering

**Acceptance Criteria**:
- [ ] Email template created
- [ ] Magic link included
- [ ] Expiration notice included
- [ ] Template renders correctly in major email clients

**Template Structure**:
```
Subject: Sign in to SuperBasic Finance

Hi there,

Click the link below to sign in to your SuperBasic Finance account:

[Sign In Button]

Or copy and paste this link into your browser:
https://app.superbasicfinance.com/v1/auth/callback/email?token=...

This link will expire in 24 hours.

If you didn't request this email, you can safely ignore it.

Need help? Contact us at support@superbasicfinance.com
```

---

### Task 17: Test Magic Link Flow

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: Task 15, Task 16

**Description**: End-to-end test of magic link authentication.

**Steps**:
1. Start dev server
2. Request magic link via `/v1/auth/signin/email`
3. Check email inbox for magic link
4. Click magic link
5. Verify redirect to callback URL
6. Verify session cookie set
7. Verify user and profile created (if new user)
8. Verify token marked as used in database

**Acceptance Criteria**:
- [ ] Magic link email delivered
- [ ] Magic link works
- [ ] Session cookie set
- [ ] User logged in
- [ ] Token cannot be reused

---

### Task 18: Implement Magic Link Rate Limiting

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: Task 17

**Description**: Add rate limiting to prevent magic link abuse.

**Steps**:
1. Create rate limit middleware for magic link requests
2. Limit to 3 requests per hour per email
3. Use existing Upstash Redis infrastructure
4. Return 429 if rate limit exceeded
5. Test rate limiting works

**Acceptance Criteria**:
- [ ] Rate limiting implemented
- [ ] 3 requests per hour per email enforced
- [ ] 429 response returned when exceeded
- [ ] Rate limit resets after 1 hour

---

## Sub-Phase 4: Middleware Migration and Testing (Week 2, Days 4-7)

### Task 19: Update Auth Middleware

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 2 hours
**Dependencies**: Task 4

**Description**: Update auth middleware to support Auth.js sessions while maintaining PAT authentication.

**Steps**:
1. Open `apps/api/src/middleware/auth.ts`
2. Add Bearer token check first (PAT auth)
3. If no Bearer token, check Auth.js session
4. Extract userId and profileId from session
5. Attach to context
6. Ensure backward compatibility

**Acceptance Criteria**:
- [ ] PAT authentication checked first
- [ ] Auth.js sessions validated
- [ ] userId and profileId attached to context
- [ ] Existing sessions still work
- [ ] No breaking changes

---

### Task 20: Migrate Integration Tests

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 4 hours
**Dependencies**: Task 19

**Description**: Update all integration tests to work with Auth.js handlers.

**Steps**:
1. Update test helpers to use `/v1/auth/*` endpoints
2. Update login test helper
3. Update registration test helper
4. Run all integration tests
5. Fix any failures
6. Ensure 100% pass rate

**Acceptance Criteria**:
- [ ] All integration tests updated
- [ ] All tests passing
- [ ] Test helpers updated
- [ ] No test regressions

---

### Task 21: Add OAuth Flow Tests

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 3 hours
**Dependencies**: Task 20

**Description**: Add integration tests for OAuth flows.

**Steps**:
1. Create test file: `apps/api/src/__tests__/oauth.test.ts`
2. Mock OAuth provider responses
3. Test Google OAuth flow
4. Test GitHub OAuth flow
5. Test account linking
6. Test OAuth errors

**Acceptance Criteria**:
- [ ] OAuth tests added (10+ tests)
- [ ] Google OAuth flow tested
- [ ] GitHub OAuth flow tested
- [ ] Account linking tested
- [ ] Error cases tested

---

### Task 22: Add Magic Link Tests

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: Task 20

**Description**: Add integration tests for magic link flow.

**Steps**:
1. Create test file: `apps/api/src/__tests__/magic-link.test.ts`
2. Mock email sending
3. Test magic link request
4. Test magic link validation
5. Test token expiration
6. Test rate limiting

**Acceptance Criteria**:
- [ ] Magic link tests added (5+ tests)
- [ ] Request flow tested
- [ ] Validation tested
- [ ] Expiration tested
- [ ] Rate limiting tested

---

### Task 23: Update E2E Tests

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 3 hours
**Dependencies**: Task 21, Task 22

**Description**: Update E2E tests to cover OAuth and magic link flows.

**Steps**:
1. Update existing auth E2E tests
2. Add OAuth flow E2E tests (if possible with mocking)
3. Add magic link flow E2E tests
4. Run full E2E suite
5. Fix any failures

**Acceptance Criteria**:
- [ ] E2E tests updated
- [ ] OAuth flows tested (or documented as manual test)
- [ ] Magic link flows tested
- [ ] All E2E tests passing

---

## Sub-Phase 5: Web Client Integration and Cleanup (Week 3)

### Task 24: Update API Client with Auth.js Endpoints

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 3 hours
**Dependencies**: Task 11, Task 12

**Description**: Update `authApi` in web client to call Auth.js handlers using REST pattern. Add form-encoded POST helper and OAuth redirect methods.

**Steps**:
1. Open `apps/web/src/lib/api.ts`
2. Add `apiFormPost()` helper for form-encoded requests (Auth.js expects `application/x-www-form-urlencoded`)
3. Update `authApi.login()` to POST to `/v1/auth/callback/credentials` with form-encoded body
4. Add `authApi.loginWithGoogle()` - redirects to `/v1/auth/signin/google`
5. Add `authApi.loginWithGitHub()` - redirects to `/v1/auth/signin/github`
6. Add `authApi.requestMagicLink(email)` - POSTs to `/v1/auth/signin/email` with form-encoded body
7. Update `authApi.me()` to call `/v1/auth/session`
8. Update `authApi.logout()` to POST to `/v1/auth/signout`
9. Keep `authApi.register()` unchanged (not part of Auth.js)

**Acceptance Criteria**:
- [ ] Form-encoded POST helper implemented
- [ ] All authApi methods updated to call Auth.js endpoints
- [ ] OAuth redirect methods added (no `@auth/react` dependency)
- [ ] TypeScript types correct
- [ ] No build errors

**Key Technical Detail**: Auth.js credential and email sign-in endpoints expect `application/x-www-form-urlencoded`, not JSON. The `apiFormPost()` helper handles this conversion.

---

### Task 25: Update AuthContext for OAuth Callback Handling

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 3 hours
**Dependencies**: Task 24

**Description**: Update `AuthContext` to handle OAuth callbacks, detect error query params, and add new auth methods.

**Steps**:
1. Open `apps/web/src/contexts/AuthContext.tsx`
2. Add `handleOAuthCallback()` function that:
   - Detects `?error=...` query param and shows error message
   - Detects `?callbackUrl=...` query param (OAuth return)
   - Calls `checkAuthStatus()` to fetch session
   - Clears query params and redirects to callbackUrl
3. Add `useEffect` hook to call `handleOAuthCallback()` on location change
4. Add `loginWithGoogle()` method - calls `authApi.loginWithGoogle()`
5. Add `loginWithGitHub()` method - calls `authApi.loginWithGitHub()`
6. Add `requestMagicLink(email)` method - calls `authApi.requestMagicLink()`
7. Update `AuthContextType` interface with new methods
8. Keep existing `login()`, `register()`, `logout()` methods unchanged

**Acceptance Criteria**:
- [ ] OAuth callback detection working
- [ ] Error query params handled and displayed
- [ ] Session fetched after OAuth return
- [ ] Query params cleared after processing
- [ ] New auth methods added to context
- [ ] TypeScript types updated
- [ ] No breaking changes to existing code

**Key Technical Detail**: After OAuth redirect, the SPA must poll `/v1/auth/session` to get user data, then clear the `callbackUrl` query param to avoid re-triggering the callback handler.

---

### Task 26: Add OAuth Buttons and Magic Link UI to Login Page

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 2 hours
**Dependencies**: Task 25

**Description**: Update login page with OAuth buttons and magic link form.

**Steps**:
1. Open `apps/web/src/pages/Login.tsx`
2. Import `loginWithGoogle`, `loginWithGitHub`, `requestMagicLink` from `useAuth()`
3. Add Google OAuth button - calls `loginWithGoogle()` on click
4. Add GitHub OAuth button - calls `loginWithGitHub()` on click
5. Add magic link form with email input
6. Add magic link submit handler - calls `requestMagicLink(email)`
7. Show "Check your email" message after magic link sent
8. Add visual separators between auth methods ("or")
9. Keep existing email/password form unchanged

**Acceptance Criteria**:
- [ ] OAuth buttons visible and functional
- [ ] Magic link form visible and functional
- [ ] Success message shown after magic link request
- [ ] Existing email/password login still works
- [ ] UI is clean and organized
- [ ] No console errors

---

### Task 27: Update CORS Configuration for OAuth Callbacks

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 30 minutes
**Dependencies**: Task 3

**Description**: Update CORS configuration to allow OAuth callback redirects.

**Steps**:
1. Open `apps/api/src/app.ts`
2. Update CORS middleware to include:
   - `http://localhost:5173` (Vite dev server)
   - `http://localhost:3000` (API dev server for OAuth callbacks)
   - `process.env.WEB_URL` (production web client)
3. Ensure `credentials: true` is set
4. Verify `allowMethods` includes GET, POST, OPTIONS
5. Test CORS with OAuth flow

**Acceptance Criteria**:
- [ ] CORS allows web client origin
- [ ] CORS allows API origin (for OAuth callbacks)
- [ ] Credentials enabled for cookies
- [ ] OAuth redirects work without CORS errors
- [ ] Existing API calls still work

---

### Task 28: Update API Documentation

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 3 hours
**Dependencies**: All previous tasks

**Description**: Update API documentation with OAuth and magic link flows.

**Steps**:
1. Update `docs/api-authentication.md`
2. Document OAuth flows (Google, GitHub)
3. Document magic link flow
4. Add OAuth setup instructions
5. Add environment variable documentation
6. Add troubleshooting section

**Acceptance Criteria**:
- [ ] Documentation updated
- [ ] OAuth flows documented
- [ ] Magic link flow documented
- [ ] Setup instructions clear
- [ ] Examples provided

---

### Task 29: Deprecate Custom Auth Routes

**Status**: Not Started
**Priority**: P2 (Low)
**Estimated Time**: 1 hour
**Dependencies**: Task 26, Task 27

**Description**: Mark custom auth routes as deprecated (keep for rollback).

**Steps**:
1. Add deprecation comments to custom routes
2. Add console warnings when custom routes used
3. Update web client to use Auth.js exclusively
4. Monitor usage of custom routes
5. Plan removal after 1 week

**Acceptance Criteria**:
- [ ] Custom routes marked as deprecated
- [ ] Warnings added
- [ ] Web client uses Auth.js only
- [ ] Usage monitored

---

### Task 30: Remove Custom Auth Routes (After 1 Week)

**Status**: Not Started
**Priority**: P2 (Low)
**Estimated Time**: 1 hour
**Dependencies**: Task 29

**Description**: Remove deprecated custom auth routes after successful migration.

**Steps**:
1. Verify no usage of custom routes
2. Delete custom route files
3. Remove route registrations
4. Update tests
5. Deploy to production

**Acceptance Criteria**:
- [ ] Custom routes removed
- [ ] No route conflicts
- [ ] Tests still passing
- [ ] Production deployment successful

---

### Task 31: Update Current Phase Documentation

**Status**: Not Started
**Priority**: P2 (Low)
**Estimated Time**: 30 minutes
**Dependencies**: All previous tasks

**Description**: Update `.kiro/steering/current-phase.md` to reflect Phase 2.1 completion.

**Steps**:
1. Open `.kiro/steering/current-phase.md`
2. Mark Phase 2.1 as complete
3. Update status summary
4. Document key achievements
5. Update next steps

**Acceptance Criteria**:
- [ ] Current phase document updated
- [ ] Phase 2.1 marked complete
- [ ] Achievements documented

---

### Task 32: Create Phase 2.1 Readme

**Status**: Not Started
**Priority**: P2 (Low)
**Estimated Time**: 2 hours
**Dependencies**: All previous tasks

**Description**: Create comprehensive readme for Phase 2.1.

**Steps**:
1. Create `docs/phase-2.1-readme.md`
2. Document what was built
3. Add sanity checks (curl commands for OAuth/magic link flows)
4. Add usage examples
5. Document OAuth setup (Google/GitHub app registration)
6. Document magic link setup (email service configuration)
7. Document REST-first architecture decision

**Acceptance Criteria**:
- [ ] Readme created
- [ ] Comprehensive documentation
- [ ] Sanity checks included with curl examples
- [ ] OAuth setup guide included
- [ ] Magic link setup guide included
- [ ] Architecture decision documented

---

## Task Summary by Priority

### P0 (Critical) - Must Complete
- Tasks 1-5: Auth.js handler integration
- Tasks 6-13: OAuth provider setup
- Tasks 19-20: Middleware migration and testing
- Task 24: Update API client with Auth.js endpoints (REST pattern)
- Task 25: Update AuthContext for OAuth callback handling
- Task 26: Add OAuth buttons and magic link UI
- Task 27: Update CORS configuration

### P1 (High) - Should Complete
- Tasks 14-18: Magic link setup
- Tasks 21-23: OAuth and magic link tests
- Task 28: Documentation updates

### P2 (Low) - Nice to Have
- Tasks 29-32: Cleanup and documentation

## Estimated Timeline

**Week 1**:
- Days 1-3: Tasks 1-5 (Auth.js handler integration)
- Days 4-7: Tasks 6-13 (OAuth provider setup)

**Week 2**:
- Days 1-3: Tasks 14-18 (Magic link setup)
- Days 4-7: Tasks 19-23 (Middleware migration and testing)

**Week 3**:
- Days 1-3: Tasks 24-28 (Web client integration, CORS, and documentation)
- Days 4-5: Tasks 29-32 (Cleanup and final documentation)

## Success Criteria

Phase 2.1 is complete when:

- [ ] All P0 tasks completed
- [ ] All P1 tasks completed
- [ ] All 225 existing tests passing (including Phase 3 PAT tests)
- [ ] New OAuth and magic link tests added (15+ tests)
- [ ] OAuth flows working (Google, GitHub) via REST redirects
- [ ] Magic link flow working via REST POST
- [ ] Web client has OAuth buttons and magic link UI
- [ ] OAuth callback handling working (error detection, session polling)
- [ ] CORS configured for OAuth redirects
- [ ] Form-encoded POST helper implemented for Auth.js endpoints
- [ ] Documentation updated with REST-first architecture
- [ ] Deployed to preview environment
- [ ] Monitoring shows > 95% OAuth success rate
- [ ] Zero forced logouts during migration
- [ ] PAT authentication (Bearer tokens) working identically
