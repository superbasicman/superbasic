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

**Sanity Check**:

```bash
# Verify @auth/core is installed
pnpm list @auth/core --filter=@repo/api
# Should show: @auth/core 0.37.4

# Verify no dependency conflicts
pnpm install --filter=@repo/api
# Should complete without errors
```

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

**Sanity Check**:

```bash
# Verify file exists
ls -la apps/api/src/auth.ts

# Check for TypeScript errors
pnpm typecheck --filter=@repo/api

# Verify exports
grep "export.*authApp" apps/api/src/auth.ts
```

---

### Task 3: Mount Auth.js Handler in Main App

**Status**: ✅ Complete
**Priority**: P0 (Critical)
**Estimated Time**: 30 minutes
**Dependencies**: Task 2

**Description**: Integrate Auth.js handler into main Hono app.

**Implementation Notes**:

- Added `trustHost: true` to Auth.js config to handle the UntrustedHost error
- Added `AUTH_URL` and `AUTH_TRUST_HOST` environment variables
- Updated `.env.example` with new Auth.js configuration variables

**Steps**:

1. ✅ Open `apps/api/src/app.ts`
2. ✅ Import `authApp` from `./auth.js`
3. ✅ Mount at `/v1/auth` using `app.route()`
4. ✅ Ensure mounted before existing routes
5. ✅ Test handler responds to `/v1/auth/signin`

**Acceptance Criteria**:

- [x] Auth.js handler mounted at `/v1/auth`
- [x] Handler responds to requests
- [x] Existing routes still functional
- [x] No route conflicts

**Sanity Check**:

```bash
# Start dev server
pnpm dev --filter=@repo/api

# Test Auth.js handler responds (in another terminal)
curl -i http://localhost:3000/v1/auth/providers
# Should return 200 with JSON list of providers

# Test existing health endpoint still works
curl -i http://localhost:3000/v1/health
# Should return 200 with {"status":"ok"}
```

---

### Task 4: Test Auth.js Handler with Credentials Provider

**Status**: ✅ Complete
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

- [x] Credentials sign-in works via Auth.js handler
- [x] Session cookie set correctly
- [x] Session data matches expected format
- [x] Sign-out clears session
- [x] Session format compatible with existing middleware

**Sanity Check**:

```bash
# Test credentials sign-in
curl -i -X POST http://localhost:3000/v1/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com&password=password123"
# Should return 302 redirect with Set-Cookie header

# Extract session cookie and test session endpoint
curl -i http://localhost:3000/v1/auth/session \
  -H "Cookie: authjs.session-token=<token_from_above>"
# Should return 200 with user data JSON

# Test sign-out
curl -i -X POST http://localhost:3000/v1/auth/signout \
  -H "Cookie: authjs.session-token=<token>"
# Should return 302 redirect and clear cookie
```

---

### Task 5: Update Environment Variables

**Status**: ✅ Complete
**Priority**: P0 (Critical)
**Estimated Time**: 15 minutes
**Dependencies**: None

**Description**: Add placeholder environment variables for OAuth and email providers.

**Steps**:

1. ✅ Update `apps/api/.env.example` with new variables
2. ✅ Add to `apps/api/.env.local` (with placeholder values)
3. ✅ Document required variables in README

**Acceptance Criteria**:

- [x] `.env.example` updated
- [x] `.env.local` has placeholders
- [x] Variables documented

**Environment Variables**:

```bash
# OAuth Providers
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email Provider (for magic links)
EMAIL_SERVER=smtp://username:password@smtp.example.com:587
EMAIL_FROM=noreply@superbasicfinance.com

# Note: Additional OAuth providers (GitHub, Apple) will be added in Phase 16
```

**Sanity Check**:

```bash
# Verify .env.example has new variables
grep "GOOGLE_CLIENT_ID" apps/api/.env.example
grep "EMAIL_SERVER" apps/api/.env.example

# Verify .env.local exists with placeholders
test -f apps/api/.env.local && echo "✓ .env.local exists"
```

---

## Sub-Phase 2: Google OAuth Setup (Week 1, Days 4-5) ✅ COMPLETE

### Task 6: Register Google OAuth App

**Status**: ✅ Complete
**Priority**: P0 (Critical)
**Estimated Time**: 1 hour
**Dependencies**: None

**Description**: Create OAuth app in Google Cloud Console.

**Setup Guide**: See `docs/oauth-setup-guide.md` for detailed step-by-step instructions.

**Note**: GitHub and Apple OAuth deferred to Phase 16 (Advanced Features). Phase 2.1 focuses on Google OAuth and magic links only.

**Implementation Notes**:

- Google OAuth app created in Google Cloud Console
- Client ID and secret obtained and added to `.env.local`
- Redirect URI configured: `http://localhost:3000/v1/auth/callback/google`
- Google provider added to Auth.js config in `packages/auth/src/config.ts`
- OAuth form requires CSRF token (fetched from `/v1/auth/csrf`)
- Login page updated with "Continue with Google" button using form POST

**Steps**:

1. ✅ Go to Google Cloud Console
2. ✅ Create new project or select existing
3. ✅ Enable Google+ API
4. ✅ Create OAuth 2.0 credentials
5. ✅ Add authorized redirect URI: `http://localhost:3000/v1/auth/callback/google`
6. ✅ Copy client ID and secret
7. ✅ Add to `.env.local`
8. ✅ Add Google provider to Auth.js config
9. ✅ Update Login page with OAuth button

**Acceptance Criteria**:

- [x] Google OAuth app created
- [x] Client ID and secret obtained
- [x] Redirect URI configured
- [x] Credentials added to `.env.local`
- [x] Google provider added to Auth.js config
- [x] `/v1/auth/providers` endpoint returns Google provider
- [x] Login page has "Continue with Google" button with CSRF token handling

**Sanity Check**:

```bash
# Verify credentials are in .env.local
grep "GOOGLE_CLIENT_ID=" apps/api/.env.local | grep -v "your_google"
# Should show actual client ID (not placeholder)

grep "GOOGLE_CLIENT_SECRET=" apps/api/.env.local | grep -v "your_google"
# Should show actual secret (not placeholder)

# Verify Google provider in config
grep -A 3 "Google" packages/auth/src/config.ts

# Test providers endpoint
curl http://localhost:3000/v1/auth/providers | jq
# Should include Google provider

# Verify redirect URI in Google Cloud Console
# Navigate to: https://console.cloud.google.com/apis/credentials
# Check that http://localhost:3000/v1/auth/callback/google is listed
```

---

---

## Sub-Phase 3: Magic Link Setup (Week 1, Days 6-7 + Week 2, Days 1-3)

### Task 7: Choose and Configure Email Service

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

**Sanity Check**:

```bash
# Verify EMAIL_SERVER in .env.local
grep "EMAIL_SERVER=" apps/api/.env.local | grep -v "smtp.example.com"
# Should show actual SMTP URL

# Test SMTP connection with Node.js
node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport(process.env.EMAIL_SERVER);
transport.verify().then(() => console.log('✓ SMTP connection successful')).catch(console.error);
"

# Or send test email
curl -X POST http://localhost:3000/v1/auth/signin/email \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=your-test-email@example.com"
# Check inbox for magic link email
```

---

### Task 8: Add Email Provider to Auth.js Config

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 1 hour
**Dependencies**: Task 7

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

**Sanity Check**:

```bash
# Verify Email provider in config
grep -A 5 "Email" packages/auth/src/config.ts

# Check SMTP configuration
grep "EMAIL_SERVER\|EMAIL_FROM" packages/auth/src/config.ts

# Verify TypeScript builds
pnpm build --filter=@repo/auth

# Test providers endpoint includes email
curl http://localhost:3000/v1/auth/providers | jq '.email'
# Should show email provider config
```

---

### Task 9: Create Magic Link Email Template

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

**Sanity Check**:

```bash
# Verify email template file exists
ls -la packages/auth/src/email-template.ts  # or .html

# Request magic link and check email
curl -X POST http://localhost:3000/v1/auth/signin/email \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=your-test-email@example.com"

# Check inbox for email with:
# - Subject line matches
# - Magic link button present
# - Plain text link present
# - Expiration notice present (24 hours)
# - Support contact present
```

---

### Task 10: Test Magic Link Flow

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: Task 8, Task 9

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

**Sanity Check**:

```bash
# Request magic link
curl -X POST http://localhost:3000/v1/auth/signin/email \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com"
# Should return 200 or 302

# Check email inbox for magic link
# Extract token from link: http://localhost:3000/v1/auth/callback/email?token=...

# Click magic link (or curl it)
curl -i "http://localhost:3000/v1/auth/callback/email?token=<token>"
# Should return 302 redirect with Set-Cookie header

# Verify session works
curl http://localhost:3000/v1/auth/session \
  -H "Cookie: authjs.session-token=<token_from_above>"
# Should return user data

# Try to reuse the same magic link token
curl -i "http://localhost:3000/v1/auth/callback/email?token=<same_token>"
# Should return error (token already used)

# Verify verification_tokens table
psql $DATABASE_URL -c "SELECT identifier, expires FROM verification_tokens WHERE identifier = 'test@example.com';"
# Token should be marked as used or deleted
```

---

### Task 11: Implement Magic Link Rate Limiting

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: Task 10

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

**Sanity Check**:

```bash
# Request magic link 3 times
for i in {1..3}; do
  curl -i -X POST http://localhost:3000/v1/auth/signin/email \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "email=test@example.com"
  echo "Request $i"
done
# First 3 should return 200 or 302

# 4th request should be rate limited
curl -i -X POST http://localhost:3000/v1/auth/signin/email \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com"
# Should return 429 Too Many Requests

# Verify rate limit in Redis
redis-cli GET "magic-link-rate-limit:test@example.com"
# Should show count = 3

# Wait 1 hour or manually clear Redis key
redis-cli DEL "magic-link-rate-limit:test@example.com"

# Verify rate limit reset
curl -i -X POST http://localhost:3000/v1/auth/signin/email \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com"
# Should return 200 or 302 again
```

---

### Task 12: Create Profile Creation Helper

**Status**: Not Started
**Priority**: P1 (High)
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

**Sanity Check**:

```bash
# Verify file exists
ls -la packages/auth/src/profile.ts

# Check function is exported
grep "ensureProfileExists" packages/auth/src/index.ts

# Run unit tests
pnpm test --filter=@repo/auth -- profile
# Should show passing tests for ensureProfileExists

# Verify TypeScript types
pnpm typecheck --filter=@repo/auth
```

---

### Task 13: Add signIn Callback for Profile Creation

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 30 minutes
**Dependencies**: Task 12

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

**Sanity Check**:

```bash
# Verify signIn callback in config
grep -A 10 "signIn.*async" packages/auth/src/config.ts

# Check it calls ensureProfileExists
grep "ensureProfileExists" packages/auth/src/config.ts

# Test with OAuth flow (after Google OAuth is working)
# Sign in with new OAuth user and verify profile created:
psql $DATABASE_URL -c "SELECT id, user_id FROM profiles WHERE user_id = '<new_oauth_user_id>';"
# Should return 1 row
```

---

### Task 14: Test Google OAuth Flow

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: Task 13

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

**Sanity Check**:

```bash
# Start OAuth flow (in browser)
open http://localhost:3000/v1/auth/signin/google

# After completing Google consent, verify database records:
psql $DATABASE_URL -c "SELECT id, email, name FROM users WHERE email = '<your_google_email>';"
# Should return 1 user

psql $DATABASE_URL -c "SELECT id, user_id FROM profiles WHERE user_id = '<user_id_from_above>';"
# Should return 1 profile

psql $DATABASE_URL -c "SELECT provider, provider_account_id FROM accounts WHERE user_id = '<user_id>';"
# Should show: provider = 'google'

# Verify session works
curl http://localhost:3000/v1/auth/session \
  -H "Cookie: authjs.session-token=<token_from_browser>"
# Should return user data with email
```

---

### Task 15: Test OAuth Account Linking

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 1 hour
**Dependencies**: Task 14

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

**Sanity Check**:

```bash
# Create user with email/password first
curl -X POST http://localhost:3000/v1/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Get user ID
psql $DATABASE_URL -c "SELECT id FROM users WHERE email = 'test@example.com';"
# Note the user_id

# Sign in with Google using same email (in browser)
open http://localhost:3000/v1/auth/signin/google
# Use test@example.com Google account

# Verify only one user exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users WHERE email = 'test@example.com';"
# Should return: count = 1

# Verify two accounts linked to same user
psql $DATABASE_URL -c "SELECT provider FROM accounts WHERE user_id = '<user_id>';"
# Should show: credentials, google (2 rows)
```

---

## Sub-Phase 4: Middleware Migration and Testing (Week 2, Days 4-7)

### Task 16: Update Auth Middleware

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

**Sanity Check**:

```bash
# Test PAT authentication (should work unchanged)
curl -i http://localhost:3000/v1/tokens \
  -H "Authorization: Bearer sbf_<your_test_token>"
# Should return 200 with token list

# Test Auth.js session authentication
curl -i http://localhost:3000/v1/tokens \
  -H "Cookie: authjs.session-token=<session_token>"
# Should return 200 with token list

# Test protected endpoint without auth
curl -i http://localhost:3000/v1/tokens
# Should return 401 Unauthorized

# Verify context has userId and profileId
# Add temporary logging in middleware and check logs:
pnpm dev --filter=@repo/api
# Logs should show: { userId: '...', profileId: '...' }
```

---

### Task 17: Migrate Integration Tests

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 4 hours
**Dependencies**: Task 16

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

**Sanity Check**:

```bash
# Run all integration tests
pnpm test --filter=@repo/api
# Should show 225+ tests passing (all Phase 3 tests + new ones)

# Run specific test suites
pnpm test --filter=@repo/api -- auth
pnpm test --filter=@repo/api -- tokens
pnpm test --filter=@repo/api -- middleware

# Check test coverage
pnpm test --filter=@repo/api -- --coverage
# Should show >80% coverage for auth and middleware

# Verify no skipped tests
pnpm test --filter=@repo/api | grep "skipped"
# Should return no results (or only intentionally skipped tests)
```

---

### Task 18: Add OAuth Flow Tests

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 3 hours
**Dependencies**: Task 17

**Description**: Add integration tests for OAuth flows.

**Reference Documentation**:

- `docs/authjs-test-helpers.md` - How to use `postAuthJsForm()` helper for CSRF handling
- `docs/authjs-test-log-suppression.md` - Expected error logs are suppressed in CI

**Steps**:

1. Create test file: `apps/api/src/__tests__/oauth.test.ts`
2. Import `postAuthJsForm` from `../test/helpers.js` for any form submissions
3. Mock OAuth provider responses
4. Test Google OAuth flow
5. Test account linking
6. Test OAuth errors

**Acceptance Criteria**:

- [ ] OAuth tests added (5+ tests)
- [ ] Google OAuth flow tested
- [ ] Account linking tested
- [ ] Error cases tested

**Sanity Check**:

```bash
# Run OAuth tests
pnpm test --filter=@repo/api -- oauth
# Should show 5+ tests passing

# Check test file exists
ls -la apps/api/src/__tests__/oauth.test.ts

# Verify test coverage
pnpm test --filter=@repo/api -- oauth --coverage
# Should show >80% coverage for OAuth flows

# List test cases
grep "it\|test" apps/api/src/__tests__/oauth.test.ts
# Should show tests for:
# - Google OAuth flow
# - Account linking
# - Invalid provider
# - Missing credentials
# - OAuth errors
```

---

### Task 19: Add Magic Link Tests

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 2 hours
**Dependencies**: Task 17

**Description**: Add integration tests for magic link flow.

**Reference Documentation**:

- `docs/authjs-test-helpers.md` - How to use `postAuthJsForm()` helper for CSRF handling
- `docs/authjs-test-log-suppression.md` - Expected error logs are suppressed in CI

**Steps**:

1. Create test file: `apps/api/src/__tests__/magic-link.test.ts`
2. Import `postAuthJsForm` from `../test/helpers.js` for magic link requests
3. Mock email sending
4. Test magic link request using `postAuthJsForm(app, '/v1/auth/signin/email', { email })`
5. Test magic link validation
6. Test token expiration
7. Test rate limiting

**Acceptance Criteria**:

- [ ] Magic link tests added (5+ tests)
- [ ] Request flow tested
- [ ] Validation tested
- [ ] Expiration tested
- [ ] Rate limiting tested

**Example Test Code**:

```typescript
// apps/api/src/__tests__/magic-link.test.ts
import { postAuthJsForm } from "../test/helpers.js";

it("should request magic link", async () => {
  const response = await postAuthJsForm(app, "/v1/auth/signin/email", {
    email: "test@example.com",
  });
  expect(response.status).toBe(200);
  // Verify email was sent (mock email service)
});
```

**Sanity Check**:

```bash
# Run magic link tests
pnpm test --filter=@repo/api -- magic-link
# Should show 5+ tests passing

# Check test file exists
ls -la apps/api/src/__tests__/magic-link.test.ts

# List test cases
grep "it\|test" apps/api/src/__tests__/magic-link.test.ts
# Should show tests for:
# - Magic link request
# - Token validation
# - Token expiration
# - Rate limiting (3 per hour)
# - Invalid email format
```

---

### Task 20: Update E2E Tests

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 3 hours
**Dependencies**: Task 18, Task 19

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

**Sanity Check**:

```bash
# Run E2E tests
pnpm test:e2e

# Or run Playwright tests
pnpm exec playwright test

# Check E2E test files
ls -la apps/web/e2e/*.spec.ts

# Run specific auth E2E tests
pnpm exec playwright test auth

# View test report
pnpm exec playwright show-report
```

---

## Sub-Phase 5: Web Client Integration and Cleanup (Week 3)

### Task 21: Update API Client with Auth.js Endpoints

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 3 hours
**Dependencies**: Task 14

**Description**: Update `authApi` in web client to call Auth.js handlers using REST pattern. Add form-encoded POST helper and OAuth redirect methods.

**Steps**:

1. Open `apps/web/src/lib/api.ts`
2. Add `apiFormPost()` helper for form-encoded requests (Auth.js expects `application/x-www-form-urlencoded`)
3. Update `authApi.login()` to POST to `/v1/auth/callback/credentials` with form-encoded body
4. Add `authApi.loginWithGoogle()` - redirects to `/v1/auth/signin/google`
5. Add `authApi.requestMagicLink(email)` - POSTs to `/v1/auth/signin/email` with form-encoded body
6. Update `authApi.me()` to call `/v1/auth/session`
7. Update `authApi.logout()` to POST to `/v1/auth/signout`
8. Keep `authApi.register()` unchanged (not part of Auth.js)

**Acceptance Criteria**:

- [ ] Form-encoded POST helper implemented
- [ ] All authApi methods updated to call Auth.js endpoints
- [ ] OAuth redirect methods added (no `@auth/react` dependency)
- [ ] TypeScript types correct
- [ ] No build errors

**Key Technical Detail**: Auth.js credential and email sign-in endpoints expect `application/x-www-form-urlencoded`, not JSON. The `apiFormPost()` helper handles this conversion.

**Sanity Check**:

```bash
# Verify apiFormPost helper exists
grep "apiFormPost" apps/web/src/lib/api.ts

# Check authApi methods updated
grep -A 3 "login\|loginWithGoogle\|requestMagicLink" apps/web/src/lib/api.ts

# Verify TypeScript builds
pnpm build --filter=@repo/web
# Should complete without errors

# Test in browser dev tools
# Open http://localhost:5173 and check Network tab
# Login request should show Content-Type: application/x-www-form-urlencoded
```

---

### Task 22: Update AuthContext for OAuth Callback Handling

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 3 hours
**Dependencies**: Task 21

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
5. Add `requestMagicLink(email)` method - calls `authApi.requestMagicLink()`
6. Update `AuthContextType` interface with new methods
7. Keep existing `login()`, `register()`, `logout()` methods unchanged

**Acceptance Criteria**:

- [ ] OAuth callback detection working
- [ ] Error query params handled and displayed
- [ ] Session fetched after OAuth return
- [ ] Query params cleared after processing
- [ ] New auth methods added to context
- [ ] TypeScript types updated
- [ ] No breaking changes to existing code

**Key Technical Detail**: After OAuth redirect, the SPA must poll `/v1/auth/session` to get user data, then clear the `callbackUrl` query param to avoid re-triggering the callback handler.

**Sanity Check**:

```bash
# Verify handleOAuthCallback function exists
grep "handleOAuthCallback" apps/web/src/contexts/AuthContext.tsx

# Check for error handling
grep "error.*query" apps/web/src/contexts/AuthContext.tsx

# Verify new methods in context
grep "loginWithGoogle\|requestMagicLink" apps/web/src/contexts/AuthContext.tsx

# Test in browser
# 1. Start OAuth flow: click "Sign in with Google"
# 2. After redirect, check URL has ?callbackUrl=...
# 3. Verify query params cleared after 1-2 seconds
# 4. Check console for any errors
# 5. Verify user is logged in (check AuthContext state)
```ts updated
- [ ] OAuth flows tested (or documented as manual test)
- [ ] Magic link flows tested
- [ ] All E2E tests passing

**Sanity Check**:

```bash
# Run E2E tests
pnpm test:e2e

# Or run Playwright tests
pnpm exec playwright test

# Check E2E test files
ls -la apps/web/e2e/*.spec.ts

# Run specific auth E2E tests
pnpm exec playwright test auth

# View test report
pnpm exec playwright show-report
```

---

### Task 23: Add OAuth Buttons and Magic Link UI to Login Page

**Status**: Not Started
**Priority**: P0 (Critical)
**Estimated Time**: 2 hours
**Dependencies**: Task 22

**Description**: Update login page with OAuth buttons and magic link form.

**Steps**:

1. Open `apps/web/src/pages/Login.tsx`
2. Import `loginWithGoogle`, `requestMagicLink` from `useAuth()`
3. Add Google OAuth button - calls `loginWithGoogle()` on click
4. Add magic link form with email input
5. Add magic link submit handler - calls `requestMagicLink(email)`
6. Show "Check your email" message after magic link sent
7. Add visual separators between auth methods ("or")
8. Keep existing email/password form unchanged

**Acceptance Criteria**:

- [ ] OAuth button visible and functional
- [ ] Magic link form visible and functional
- [ ] Success message shown after magic link request
- [ ] Existing email/password login still works
- [ ] UI is clean and organized
- [ ] No console errors

**Sanity Check**:

```bash
# Start web dev server
pnpm dev --filter=@repo/web

# Open browser to login page
open http://localhost:5173/login

# Manual UI checks:
# 1. Verify "Sign in with Google" button visible
# 2. Verify magic link email input and submit button
# 3. Verify "or" separators between auth methods
# 4. Verify existing email/password form still present

# Test OAuth button click
# Click "Sign in with Google" → should redirect to Google OAuth

# Test magic link form
# Enter email → click submit → should show "Check your email" message

# Check browser console
# Should have no errors (open DevTools → Console tab)
```

---

### Task 24: Update CORS Configuration for OAuth Callbacks

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

**Sanity Check**:

```bash
# Check CORS configuration
grep -A 10 "cors" apps/api/src/app.ts

# Verify origins include localhost:5173 and localhost:3000
grep "localhost:5173\|localhost:3000" apps/api/src/app.ts

# Test CORS with preflight request
curl -i -X OPTIONS http://localhost:3000/v1/auth/session \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
# Should return 200 with Access-Control-Allow-Origin header

# Test OAuth flow in browser
# Open http://localhost:5173/login
# Click "Sign in with Google"
# Check browser console for CORS errors (should be none)

# Test existing API calls
curl -i http://localhost:3000/v1/health \
  -H "Origin: http://localhost:5173"
# Should return 200 with CORS headers
```

---

### Task 25: Update API Documentation

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 3 hours
**Dependencies**: All previous tasks

**Description**: Update API documentation with OAuth and magic link flows.

**Steps**:

1. Update `docs/api-authentication.md`
2. Document OAuth flows (Google)
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

**Sanity Check**:

````bash
# Verify documentation file updated
ls -la docs/api-authentication.md

# Check for OAuth sections
grep -i "oauth\|google" docs/api-authentication.md

# Check for magic link section
grep -i "magic link\|email" docs/api-authentication.md

# Verify setup instructions present
grep -i "setup\|configuration" docs/api-authentication.md

# Check for code examples
grep "```" docs/api-authentication.md | wc -l
# Should show multiple code blocks (5+)
````

---

### Task 26: Deprecate Custom Auth Routes

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

**Sanity Check**:

```bash
# Check CORS configuration
grep -A 10 "cors" apps/api/src/app.ts

# Verify origins include localhost:5173 and localhost:3000
grep "localhost:5173\|localhost:3000" apps/api/src/app.ts

# Test CORS with preflight request
curl -i -X OPTIONS http://localhost:3000/v1/auth/session \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
# Should return 200 with Access-Control-Allow-Origin header

# Test OAuth flow in browser
# Open http://localhost:5173/login
# Click "Sign in with Google"
# Check browser console for CORS errors (should be none)

# Test existing API calls
curl -i http://localhost:3000/v1/health \
  -H "Origin: http://localhost:5173"
# Should return 200 with CORS headers
```

---

### Task 27: Remove Custom Auth Routes (After 1 Week)

**Status**: Not Started
**Priority**: P1 (High)
**Estimated Time**: 3 hours
**Dependencies**: All previous tasks

**Description**: Update API documentation with OAuth and magic link flows.

**Steps**:

1. Update `docs/api-authentication.md`
2. Document OAuth flows (Google)
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

**Sanity Check**:

````bash
# Verify documentation file updated
ls -la docs/api-authentication.md

# Check for OAuth sections
grep -i "oauth\|google" docs/api-authentication.md

# Check for magic link section
grep -i "magic link\|email" docs/api-authentication.md

# Verify setup instructions present
grep -i "setup\|configuration" docs/api-authentication.md

# Check for code examples
grep "```" docs/api-authentication.md | wc -l
# Should show multiple code blocks (5+)
````

---

### Task 28: Update Current Phase Documentation

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

**Sanity Check**:

```bash
# Check for deprecation comments
grep -i "deprecated" apps/api/src/routes/v1/auth/*.ts

# Verify console warnings added
grep "console.warn\|logger.warn" apps/api/src/routes/v1/auth/*.ts

# Check web client doesn't call custom routes
grep -r "/v1/auth/login\|/v1/auth/register" apps/web/src/
# Should return no results (or only in comments)

# Monitor API logs for custom route usage
pnpm dev --filter=@repo/api | grep "DEPRECATED"
# Should show warnings if custom routes are called
```

---

### Task 29: Create Phase 2.1 Readme

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

**Sanity Check**:

```bash
# Verify custom auth route files deleted
ls apps/api/src/routes/v1/auth/login.ts 2>/dev/null
# Should return: No such file or directory

ls apps/api/src/routes/v1/auth/register.ts 2>/dev/null
# Should return: No such file or directory

# Check route registrations removed
grep "auth/login\|auth/register" apps/api/src/app.ts
# Should return no results

# Run all tests
pnpm test
# Should show all tests passing (225+)

# Verify production build
pnpm build
# Should complete without errors

# Check production deployment
curl https://api.superbasicfinance.com/v1/auth/providers
# Should return provider list (Auth.js working)
```

---

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
5. Document OAuth setup (Google app registration)
6. Document magic link setup (email service configuration)
7. Document REST-first architecture decision

**Acceptance Criteria**:

- [ ] Readme created
- [ ] Comprehensive documentation
- [ ] Sanity checks included with curl examples
- [ ] OAuth setup guide included
- [ ] Magic link setup guide included
- [ ] Architecture decision documented

**Sanity Check**:

```bash
# Verify readme file created
ls -la docs/phase-2.1-readme.md

# Check for required sections
grep "## " docs/phase-2.1-readme.md
# Should show sections for:
# - Overview
# - What Was Built
# - Sanity Checks
# - OAuth Setup
# - Magic Link Setup
# - Architecture Decisions

# Verify sanity checks section has curl commands
grep -A 5 "Sanity Checks" docs/phase-2.1-readme.md | grep "curl"

# Check OAuth setup instructions
grep -A 10 "OAuth Setup\|Google" docs/phase-2.1-readme.md

# Check magic link setup
grep -A 10 "Magic Link\|Email" docs/phase-2.1-readme.md

# Verify architecture decision documented
grep -i "REST\|API-first\|Capacitor" docs/phase-2.1-readme.md
```

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
- [ ] OAuth flows working (Google) via REST redirects
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
