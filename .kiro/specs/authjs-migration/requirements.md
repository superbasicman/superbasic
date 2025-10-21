# Phase 2.1: Full Auth.js Migration - Requirements

## Overview

Migrate from hybrid Auth.js approach (using utilities only) to full Auth.js implementation with OAuth providers and magic link authentication. This enables social login and passwordless authentication while maintaining backward compatibility with existing sessions and PAT tokens.

## Context

### Current State (Phase 2 Hybrid Approach)

**What We Have:**
- Auth.js database tables (`users`, `accounts`, `sessions`, `verification_tokens`)
- Auth.js config file with Credentials provider
- Auth.js JWT utilities (`encode`, `decode`) for token management
- Custom Hono routes (`/v1/login`, `/v1/register`, `/v1/logout`, `/v1/me`)
- Manual JWT generation and validation
- 225 passing tests (unit, integration, E2E) after Phase 3 completion
- PAT authentication system (Phase 3) using Bearer tokens

**What We're Missing:**
- Auth.js request handlers (using custom routes instead)
- OAuth providers (Google, GitHub) implemented using Auth.js handlers
- Extensible configuration to add additional providers (e.g., Apple) later
- Magic link authentication (passwordless email)
- Automatic account linking by email
- OAuth callback handling
- Standardized Auth.js session management

### Why Migrate?

1. **OAuth Support**: Enable social login (Google, GitHub) now, while keeping configuration pluggable for future providers (Apple, Microsoft, etc.) without rebuilding flows
2. **Magic Links**: Passwordless authentication for better UX
3. **Standardization**: Use Auth.js patterns instead of custom implementations
4. **Future-Proofing**: Easier to add new providers (Microsoft, Twitter, etc.)
5. **Maintenance**: Leverage Auth.js updates and security patches
6. **Account Linking**: Automatic linking of OAuth accounts to existing users

## Goals

### Primary Goals

1. **Enable OAuth Authentication**
   - Users can sign in with Google
   - Users can sign in with GitHub
   - Architecture supports dropping in additional providers (e.g., Apple) with minimal changes
   - OAuth accounts automatically linked to existing users by email

2. **Enable Magic Link Authentication**
   - Users can request passwordless login via email
   - Magic links expire after 24 hours
   - One-time use tokens stored in `verification_tokens` table
   - Rate limiting on magic link requests (3 per hour per email)

3. **Maintain Backward Compatibility**
   - Existing JWT sessions remain valid (no forced logouts)
   - Email/password authentication continues working
   - PAT authentication (Phase 3) completely unaffected
   - All 225 existing tests pass after migration (includes Phase 3 PAT tests)

4. **Seamless User Experience**
   - OAuth flow completes in < 5 seconds
   - Magic links delivered in < 30 seconds
   - Clear error messages for OAuth failures
   - Automatic profile creation for new OAuth users

### Secondary Goals

1. **Improved Developer Experience**
   - Use Auth.js Hono adapter for cleaner integration
   - Standardized session management
   - Better OAuth debugging with Auth.js logs

2. **Enhanced Security**
   - OAuth state parameter validation (CSRF protection)
   - PKCE flow for OAuth (where supported)
   - Secure token storage in httpOnly cookies
   - Rate limiting on magic link requests

3. **Operational Excellence**
   - Clear rollback plan if issues arise
   - Monitoring for OAuth success/failure rates
   - Audit logging for OAuth and magic link events

## Non-Goals

- **No database schema changes**: Auth.js tables already exist from Phase 2
- **No breaking changes**: Existing sessions and PATs must continue working
- **No forced migration**: Users not required to switch to OAuth
- **No custom OAuth flows**: Use Auth.js providers only (no manual OAuth implementation)
- **No SMS authentication**: Email magic links only (SMS is Phase 14)
- **No multi-factor authentication**: 2FA is a future enhancement

## User Stories

### OAuth Authentication

**As a new user**, I want to sign up with my Google account so that I don't have to create another password.

**Acceptance Criteria:**
- Google OAuth button visible on registration page
- Clicking button redirects to Google consent screen
- After consent, user redirected back to app
- User automatically logged in with session cookie
- Profile record created with Google email and name
- User can access protected routes immediately

---

**As an existing user**, I want to link my GitHub account so that I can log in with either email/password or GitHub.

**Acceptance Criteria:**
- GitHub OAuth button visible on login page
- OAuth email matches existing user account
- GitHub account linked to existing user (stored in `accounts` table)
- User logged in with existing profile
- No duplicate user or profile created
- User can log in with either method in future

---

**As a user**, I want clear error messages if OAuth fails so that I know what went wrong.

**Acceptance Criteria:**
- OAuth cancellation shows "Sign in cancelled" message
- Email mismatch shows "Account already exists with different provider"
- Network errors show "Unable to connect to [Provider]. Please try again."
- All errors logged for debugging

### Magic Link Authentication

**As a user**, I want to log in without a password using a magic link sent to my email.

**Acceptance Criteria:**
- "Sign in with email" option visible on login page
- Entering email sends magic link within 30 seconds
- Clicking magic link logs user in automatically
- Magic link expires after 24 hours
- Used magic links cannot be reused
- Rate limiting prevents spam (3 requests per hour per email)

---

**As a user**, I want to know when my magic link has been sent so that I know to check my email.

**Acceptance Criteria:**
- Success message shows "Check your email for a magic link"
- Email includes clear subject line "Sign in to SuperBasic Finance"
- Email includes magic link button and plain text link
- Email includes expiration time (24 hours)
- Email includes support contact if issues arise

### Backward Compatibility

**As an existing user**, I want my current session to remain valid after the migration so that I'm not logged out.

**Acceptance Criteria:**
- Existing JWT sessions work with Auth.js handlers
- No forced logout during migration
- Session expiration unchanged (30 days)
- User context (userId, profileId) still attached to requests

---

**As a developer**, I want PAT authentication to continue working so that API integrations don't break.

**Acceptance Criteria:**
- Bearer token authentication unchanged
- PAT middleware runs before Auth.js session check
- Token scopes still enforced
- All 225 PAT tests still passing

## Functional Requirements

### FR-1: Auth.js Hono Adapter Integration

**Priority**: P0 (Critical)

**Description**: Install and configure Auth.js Hono adapter to handle authentication requests.

**Requirements:**
- Install `@auth/hono` package
- Create Auth.js handler at `/v1/auth/*`
- Configure Auth.js with existing config from `packages/auth/src/config.ts`
- Mount handler in Hono app
- Verify handler responds to `/v1/auth/signin`, `/v1/auth/signout`, `/v1/auth/callback/*`

**Success Criteria:**
- Auth.js handler responds to requests
- Credentials provider works via Auth.js handler
- Sessions created by Auth.js handler are valid
- Existing custom routes still functional (parallel deployment)

---

### FR-2: OAuth Provider Configuration

**Priority**: P0 (Critical)

**Description**: Configure Google and GitHub OAuth providers in Auth.js config.

**Requirements:**
- Register OAuth apps with Google and GitHub
- Add OAuth client IDs and secrets to environment variables
- Configure OAuth providers in Auth.js config
- Set up OAuth callback URLs (`/v1/auth/callback/google`, `/v1/auth/callback/github`)
- Handle OAuth state parameter for CSRF protection
- Implement account linking by email

**Success Criteria:**
- Google OAuth flow completes successfully
- GitHub OAuth flow completes successfully
- OAuth accounts linked to existing users by email
- New OAuth users create user + profile records
- OAuth errors handled gracefully

---

### FR-3: Magic Link Email Provider

**Priority**: P1 (High)

**Description**: Configure Email provider for passwordless magic link authentication.

**Requirements:**
- Choose email service (SendGrid, Postmark, or Resend)
- Configure SMTP settings in environment variables
- Add Email provider to Auth.js config
- Create email template for magic links
- Implement rate limiting (3 requests per hour per email)
- Store magic link tokens in `verification_tokens` table

**Success Criteria:**
- Magic link emails delivered within 30 seconds
- Magic links log users in successfully
- Magic links expire after 24 hours
- Used magic links cannot be reused
- Rate limiting prevents abuse

---

### FR-4: Auth Middleware Migration

**Priority**: P0 (Critical)

**Description**: Update auth middleware to support Auth.js session format while maintaining PAT authentication.

**Requirements:**
- Modify `apps/api/src/middleware/auth.ts` to handle Auth.js sessions
- Maintain PAT authentication (Bearer token check first)
- Extract `userId` and `profileId` from Auth.js session
- Ensure backward compatibility with existing JWT format
- Add `authType` context variable (`session` or `pat`)

**Success Criteria:**
- Auth.js sessions validated correctly
- PAT authentication still works
- Both `userId` and `profileId` attached to context
- Existing protected routes work with both auth types
- All 225 existing tests pass (includes Phase 3 PAT tests)

---

### FR-5: Web Client OAuth Integration

**Priority**: P0 (Critical)

**Description**: Add OAuth provider buttons to login and registration pages.

**Requirements:**
- Add Google OAuth button to login page
- Add GitHub OAuth button to login page
- Add "Sign in with email" option for magic links
- Redirect to `/v1/auth/signin/*` endpoints (REST pattern, no `@auth/react`)
- Handle OAuth callback query params (`?error=...`, `?callbackUrl=...`)
- Poll `/v1/auth/session` after OAuth redirect to fetch user data
- Display loading state during OAuth flow
- Show error messages for OAuth failures

**Success Criteria:**
- OAuth buttons visible and functional
- Clicking button initiates OAuth flow
- User redirected to provider consent screen
- After consent, user redirected back and logged in
- Error messages displayed for failures

---

### FR-6: Test Migration

**Priority**: P0 (Critical)

**Description**: Migrate all 225 existing tests to work with Auth.js handlers (includes Phase 3 PAT tests).

**Requirements:**
- Update integration tests to use `/v1/auth/*` endpoints
- Mock OAuth provider responses in tests
- Add magic link flow tests
- Ensure E2E tests work with Auth.js
- Maintain 100% test pass rate

**Success Criteria:**
- All 225 existing tests passing (includes Phase 3 PAT tests)
- New OAuth flow tests added (10+ tests)
- New magic link tests added (5+ tests)
- E2E tests cover OAuth and magic link flows
- Test coverage maintained or improved
- PAT authentication tests continue passing unchanged

---

### FR-7: Documentation Updates

**Priority**: P1 (High)

**Description**: Update API documentation and developer guides for Auth.js migration.

**Requirements:**
- Update `docs/api-authentication.md` with OAuth flows
- Add OAuth provider setup guide
- Document magic link flow
- Update environment variable documentation
- Create migration guide for developers
- Document rollback procedure

**Success Criteria:**
- Documentation reflects Auth.js implementation
- OAuth setup instructions clear and complete
- Magic link flow documented with examples
- Migration guide helps developers understand changes

## Non-Functional Requirements

### NFR-1: Performance

- OAuth flow completes in < 5 seconds (p95)
- Magic link delivery in < 30 seconds (p95)
- Auth.js session validation < 50ms (p95)
- No performance degradation for PAT authentication

### NFR-2: Security

- OAuth state parameter validated (CSRF protection)
- PKCE flow used where supported (Google, GitHub)
- Magic link tokens cryptographically secure (32 bytes)
- Rate limiting on magic link requests (3 per hour per email)
- OAuth tokens never exposed to client (server-side only)

### NFR-3: Reliability

- OAuth success rate > 95% (excluding user cancellations)
- Magic link delivery success rate > 99%
- Zero downtime during migration (parallel deployment)
- Rollback possible within 5 minutes if issues arise

### NFR-4: Compatibility

- Existing JWT sessions remain valid
- PAT authentication unchanged
- All 225 existing tests pass (includes Phase 3 PAT tests)
- No database schema changes required

### NFR-5: Observability

- OAuth events logged (success, failure, cancellation)
- Magic link events logged (sent, used, expired)
- Auth.js debug logs enabled in development
- Metrics tracked (OAuth success rate, magic link delivery time)

## Technical Constraints

### Must Use

- Auth.js Hono adapter (`@auth/hono`)
- Existing Auth.js config structure
- Existing database schema (no migrations)
- Existing PAT authentication system

### Must Not Break

- Existing JWT sessions (backward compatibility)
- PAT authentication (Phase 3)
- Existing tests (must pass after migration)
- User profiles (no data loss)

### Environment Variables Required

```bash
# OAuth Providers
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Email Provider (for magic links)
EMAIL_SERVER=smtp://username:password@smtp.example.com:587
EMAIL_FROM=noreply@superbasicfinance.com

# Auth.js (existing)
AUTH_SECRET=... (already configured)
```

## Dependencies

### Completed Prerequisites

- ✅ Phase 1: Monorepo infrastructure
- ✅ Phase 2: Auth.js tables and utilities
- ✅ Phase 3: PAT authentication
- ✅ Auth.js config file exists
- ✅ Database schema has Auth.js tables

### External Dependencies

- OAuth provider accounts (Google Cloud Console, GitHub Apps)
- Email service account (SendGrid, Postmark, or Resend)
- Domain for OAuth callbacks (can use localhost for development)

### Internal Dependencies

- `@auth/hono` package (to be installed)
- `@auth/core` package (already installed)
- `@auth/prisma-adapter` package (already installed)
- Email service SDK (to be chosen and installed)

## Success Metrics

### Adoption Metrics

- 30% of new users sign up with OAuth within first month
- 10% of existing users link OAuth accounts within first month
- 5% of users use magic links within first month

### Performance Metrics

- OAuth flow completion time < 5 seconds (p95)
- Magic link delivery time < 30 seconds (p95)
- Auth.js session validation < 50ms (p95)

### Quality Metrics

- OAuth success rate > 95% (excluding user cancellations)
- Magic link delivery success rate > 99%
- Zero forced logouts during migration
- All 225 tests passing (includes Phase 3 PAT tests)

### Security Metrics

- Zero OAuth CSRF attacks
- Zero magic link token reuse
- Rate limiting blocks > 99% of abuse attempts

## Risks and Mitigations

### Risk: Existing Sessions Invalidated

**Impact**: High - Users forced to log in again

**Mitigation**:
- Test JWT format compatibility before migration
- Deploy Auth.js handlers in parallel with custom routes
- Monitor session validation errors
- Keep custom routes for 1 week as fallback

### Risk: PAT Authentication Breaks

**Impact**: Critical - API integrations fail

**Mitigation**:
- PAT middleware runs before Auth.js session check
- Comprehensive PAT tests before and after migration
- Separate PAT and session authentication logic
- Rollback plan if PAT tests fail

### Risk: OAuth Provider Outages

**Impact**: Medium - Users can't log in with OAuth

**Mitigation**:
- Keep email/password authentication available
- Display clear error messages for provider outages
- Monitor OAuth provider status pages
- Graceful degradation (hide OAuth buttons if provider down)

### Risk: Magic Link Delivery Failures

**Impact**: Medium - Users can't log in with magic links

**Mitigation**:
- Choose reliable email service (SendGrid, Postmark)
- Monitor email delivery rates
- Provide alternative login methods
- Clear error messages if email fails

### Risk: Migration Complexity

**Impact**: Medium - Takes longer than 3 weeks

**Mitigation**:
- Break migration into 5 sub-phases
- Deploy incrementally (handlers, OAuth, magic links)
- Test thoroughly at each stage
- Adjust timeline if needed

## Open Questions

1. **Which email service should we use?**
   - Options: SendGrid, Postmark, Resend
   - Decision: TBD based on pricing and reliability

2. **Should we support Apple OAuth now?**
   - Requires Apple Developer account ($99/year)
   - **Decision**: Defer. Current implementation keeps providers extensible so Apple (or others) can be added later without code churn once we invest in the account.

3. **How long should we keep custom routes?**
   - Proposal: 1 week after successful migration
   - Decision: TBD based on monitoring

4. **Should we force email verification for OAuth users?**
   - OAuth providers verify emails, but should we double-check?
   - Decision: Trust OAuth provider verification

5. **What should magic link email template look like?**
   - Need design for email template
   - Decision: TBD, create simple template first

## Acceptance Criteria Summary

Phase 2.1 is complete when:

- [ ] Auth.js Hono adapter installed and configured
- [ ] Google OAuth working end-to-end
- [ ] GitHub OAuth working end-to-end
- [ ] OAuth provider configuration documented to allow drop-in providers (e.g., Apple)
- [ ] Magic link authentication working end-to-end
- [ ] Existing email/password authentication still works
- [ ] Existing JWT sessions remain valid
- [ ] PAT authentication (Phase 3) unaffected
- [ ] All 225 existing tests passing (includes Phase 3 PAT tests)
- [ ] New OAuth and magic link tests added (15+ tests)
- [ ] Web client has OAuth buttons and magic link option
- [ ] Documentation updated with OAuth and magic link flows
- [ ] Migration deployed to preview environment
- [ ] Monitoring shows > 95% OAuth success rate
- [ ] Zero forced logouts during migration
- [ ] Rollback plan tested and documented

## Timeline

**Total Duration**: 3 weeks

- **Week 1**: Auth.js handler integration + OAuth setup
- **Week 2**: Magic links + migration + testing
- **Week 3**: Documentation + monitoring + cleanup

**Milestones**:
- End of Week 1: Auth.js handlers working, OAuth flows tested
- End of Week 2: Magic links working, all tests passing
- End of Week 3: Documentation complete, custom routes removed
