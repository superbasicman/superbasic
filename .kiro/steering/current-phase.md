# Current Phase Context

**Active Phase**: Phase 2.1 - Auth.js Migration  
**Status**: 🔄 IN PROGRESS - Migrating to Auth.js Prisma adapter with UUID users table  
**Spec Location**: `.kiro/specs/authjs-migration/`  
**Previous Phase**: Phase 3 - API Key Management (✅ COMPLETE, needs revalidation after migration)

---

## Context: Why We're Stepping Back

Phase 3 (API Key Management) was completed successfully with 225 passing tests. However, during planning for Phase 4 (Plaid Integration), we identified a misalignment between the implemented authentication system and the documented architecture in `database-schema.md`. 

The schema document specifies Auth.js as the standard with a UUID-based `users` table, but the current implementation uses a custom auth system. To maintain architectural consistency and avoid technical debt, we're completing the Auth.js migration now before proceeding to Plaid integration.

**What This Means:**
- Phase 3 deliverables remain intact but will need retesting after migration
- All 225 tests will be updated to work with Auth.js sessions
- API key authentication (Bearer tokens) will continue working unchanged
- This is a refactor, not a feature addition - no new user-facing functionality

---

## Phase 2.1 Overview

Migrate from custom authentication to Auth.js Prisma adapter with proper UUID-based users table, ensuring compatibility with the existing profiles-based business logic and API key system.

### Why This Phase Exists

Phase 2 implemented a custom auth system, and Phase 3 built API key management on top of it. However, the database schema document specifies Auth.js as the standard, and we need to align the implementation with the documented architecture before proceeding to Plaid integration.

### Migration Strategy

1. **Add Auth.js Prisma adapter tables** (users, accounts, sessions, verification_tokens) with UUID primary keys
2. **Preserve existing profiles table** - business logic continues to reference `profiles.id`
3. **Update api_keys table** - add `userId` reference to Auth.js users table
4. **Migrate auth middleware** - use Auth.js session management instead of custom JWT
5. **Update all tests** - ensure 225 existing tests pass with new auth system
6. **Revalidate Phase 3** - confirm API key management works with Auth.js

## Phase 3 Context (Completed, Needs Revalidation)

Phase 3 delivered a complete API key management system with PAT generation, Bearer auth, and scope enforcement. All 12 tasks were implemented and 225 tests were passing. After the Auth.js migration, we'll need to revalidate this functionality.

## Key Deliverables

- PAT generation with cryptographically secure random tokens
- SHA-256 token hashing before database storage
- Bearer token authentication middleware (separate from session auth)
- Token scopes and permissions system (read:transactions, write:budgets, etc.)
- CRUD endpoints: POST /v1/tokens, GET /v1/tokens, DELETE /v1/tokens/:id
- Last used timestamp tracking and expiration handling
- Web UI for token management (create, list, revoke)
- Token creation flow (show plaintext once, then hash forever)

## Critical Constraints

### Security Requirements
- **Never store plaintext tokens** - show once on creation, hash immediately with SHA-256
- **Token ownership** - must reference either `profile_id` OR `workspace_id` (not both, not neither)
- **Audit everything** - log token creation, usage, and revocation with full context
- **Rate limiting** - apply limits to token-authenticated requests (separate from session limits)

### Database Schema
```prisma
model ApiKey {
  id            String    @id @default(uuid())
  userId        String    // Auth.js user reference
  profileId     String?   // Business logic owner (personal tokens)
  workspaceId   String?   // Workspace-scoped tokens
  name          String    // User-friendly label
  keyHash       String    @unique // SHA-256 hash of token
  scopes        Json      @default("[]") // Array of permission strings
  lastUsedAt    DateTime?
  expiresAt     DateTime?
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([userId])
  @@index([profileId])
  @@index([workspaceId])
  @@index([revokedAt]) // Partial index for active tokens
}
```

### Authentication Flow
1. **Session auth** (existing): JWT in httpOnly cookie → `userId` + `profileId` in context
2. **Token auth** (new): `Authorization: Bearer <token>` → hash lookup → `userId` + `profileId` + `scopes` in context
3. **Middleware priority**: Check Bearer header first, fall back to session cookie
4. **Scope enforcement**: Validate required scopes on protected endpoints

## Exit Criteria

- ✅ Users can create API keys with custom names and scopes
- ✅ Plaintext token shown once on creation, never retrievable again
- ✅ API requests with `Authorization: Bearer <token>` authenticate successfully
- ✅ Invalid, expired, or revoked tokens return 401 with clear error message
- ✅ Token scopes enforced on protected endpoints (e.g., read-only tokens can't POST)
- ✅ Users can list their tokens (masked values, metadata visible)
- ✅ Users can revoke tokens with confirmation dialog
- ✅ Audit log records token creation, usage, and revocation
- ✅ Integration tests cover full token lifecycle (225 tests passing)
- ✅ Documentation includes API authentication guide with examples

## Implementation Progress

### ✅ Phase 3: COMPLETE

**All 12 Tasks Implemented:**

1. ✅ Database schema and migrations
2. ✅ Core token utilities (generation, hashing, scope validation)
3. ✅ Bearer token authentication middleware
4. ✅ Token creation endpoint (POST /v1/tokens)
5. ✅ Token listing endpoint (GET /v1/tokens)
6. ✅ Token revocation endpoint (DELETE /v1/tokens/:id)
7. ✅ Token name update endpoint (PATCH /v1/tokens/:id)
8. ✅ Rate limiting for token operations
9. ✅ Audit logging integration
10. ✅ Web UI for token management
11. ✅ API documentation
12. ✅ Integration with existing endpoints (scope enforcement)

**Test Results:**
- 225 API tests passing (100% pass rate)
- 13 scope enforcement tests passing
- 64 token utility tests passing
- All integration tests using real database
- Test isolation issue resolved

**Token Format**: `sbf_` + 43 base64url characters = 47 total characters (256 bits of entropy)

**Documentation:**
- `docs/api-authentication.md` - Complete API authentication guide
- `docs/test-isolation-fix.md` - Test infrastructure improvements
- `docs/phase-3-task-12-completion.md` - Task 12 completion summary
- `docs/phase-3-test-status.md` - Comprehensive test status

## Implementation Notes

### Token Generation
```typescript
import crypto from 'node:crypto';

// Generate: sbf_<32 random bytes as base64url>
const token = `sbf_${crypto.randomBytes(32).toString('base64url')}`;

// Hash for storage
const keyHash = crypto.createHash('sha256').update(token).digest('hex');
```

### Bearer Auth Middleware
- Extract token from `Authorization: Bearer <token>` header
- Hash incoming token and lookup in database
- Check expiration and revocation status
- Attach `userId`, `profileId`, `workspaceId`, `scopes` to context
- Return 401 if invalid/expired/revoked

### Scope System (Initial Set)
- `read:transactions` - View transaction data
- `write:transactions` - Modify transaction overlays
- `read:budgets` - View budget data
- `write:budgets` - Create/modify budgets
- `read:accounts` - View connected accounts
- `write:accounts` - Connect/disconnect accounts
- `admin:tokens` - Manage API tokens (default for session auth)

## Dependencies

### Completed Prerequisites
- ✅ Phase 1: Monorepo infrastructure
- ✅ Phase 2: Authentication foundation (session auth, profiles table)
- ✅ Auth middleware pattern established
- ✅ Audit logging infrastructure (Pino)
- ✅ Rate limiting infrastructure (Upstash Redis)

### External Dependencies
- None (uses existing infrastructure)

### Blockers
- None (ready to start)

---

## Phase 3 Completion Summary

**Completion Date**: 2025-10-20  
**Total Duration**: ~3 weeks  
**Final Test Count**: 225 passing (0 failing)  
**Key Achievement**: Full API key management system with scope enforcement

### What Was Delivered

1. **Complete PAT System**: Token generation, hashing, authentication, and lifecycle management
2. **Scope Enforcement**: Fine-grained permissions with session auth bypass
3. **Web UI**: Full token management interface with create/list/revoke/rename
4. **Comprehensive Testing**: 225 tests covering all functionality
5. **Production-Ready**: Rate limiting, audit logging, security best practices
6. **Documentation**: Complete API authentication guide with examples

### Key Learnings

1. **Test Infrastructure**: Vitest mocking requires explicit `vi.unmock()` in integration tests
2. **Auth Patterns**: Unified middleware supporting both session and PAT authentication
3. **Security**: Never store plaintext tokens, show once on creation, hash with SHA-256
4. **Scope Design**: Session auth has full access, PAT auth is scope-restricted

### Technical Debt

None - Phase 3 is production-ready with no known issues.

---

## Phase 2.1 Exit Criteria

Before proceeding to Phase 4 (Plaid Integration):

- [ ] Auth.js Prisma adapter fully integrated with UUID users table
- [ ] All 225 existing tests passing with Auth.js sessions
- [ ] API key authentication (Bearer tokens) working unchanged
- [ ] OAuth flows implemented (Google, GitHub)
- [ ] Magic link authentication working
- [ ] Auth middleware updated to use Auth.js session management
- [ ] Web client updated to use Auth.js methods
- [ ] E2E tests updated for new auth flows
- [ ] Documentation updated with OAuth setup guide

---

## Next Phase Preview

**Phase 4**: Plaid Integration - Bank Connections  
**Goal**: Connect bank accounts via Plaid Link and sync account metadata  
**Blocker**: Requires Phase 2.1 completion + Plaid developer account setup  
**Key Deliverables**: Link token creation, public token exchange, account sync, webhook handler

**Preparation Steps:**
1. Complete Phase 2.1 Auth.js migration
2. Revalidate Phase 3 API key management with new auth system
3. Register for Plaid developer account (https://dashboard.plaid.com/signup)
4. Obtain Sandbox API keys (client_id, secret)
5. Review Plaid documentation (https://plaid.com/docs/)

---

## Related Documentation

- **Full Roadmap**: `docs/project_plan.md` - Complete 18-phase plan with all details
- **Phase Summaries**: `docs/phase-1-readme.md`, `docs/phase-2-readme.md`
- **Phase 3 Completion**: `docs/phase-3-task-12-completion.md`
- **Test Infrastructure**: `docs/test-isolation-fix.md`
- **Database Schema**: `.kiro/steering/database-schema.md` - Complete schema reference
- **API Authentication**: `docs/api-authentication.md` - Authentication guide

---

**Last Updated**: 2025-10-20  
**Update Trigger**: Phase 3 completed, ready to start Phase 4
