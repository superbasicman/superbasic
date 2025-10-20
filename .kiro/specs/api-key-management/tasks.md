# Implementation Plan

- [x] 1. Database schema and migrations

  - Create Prisma schema for `ApiKey` model with userId, profileId, workspaceId, name, keyHash, last4, scopes, lastUsedAt, expiresAt, revokedAt, createdAt, updatedAt
  - Add CHECK constraint ensuring either profileId OR workspaceId is set (not both, not neither)
  - Add unique index on keyHash for efficient token lookup
  - Add indexes on userId, profileId, workspaceId for ownership queries
  - Add partial index on revokedAt IS NULL for active token queries
  - Generate and run Prisma migration
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 2. Core token utilities in @repo/auth

  - [x] 2.1 Implement token generation and hashing functions

    - Write `generateToken()` function using crypto.randomBytes(32) with `sbf_` prefix and base64url encoding
    - Write `hashToken()` function using SHA-256
    - Write `isValidTokenFormat()` function to validate token structure before database lookup
    - Export utilities from `@repo/auth/tokens.ts`
    - _Requirements: 1.1, 1.2, 1.3, 14.3_

  - [x] 2.2 Implement scope validation utilities

    - Define valid scope constants: `read:transactions`, `write:transactions`, `read:budgets`, `write:budgets`, `read:accounts`, `write:accounts`, `read:profile`, `write:profile`
    - Write `isValidScope()` function to check if scope is in valid set
    - Write `hasScope()` function to check if token has required scope
    - Export from `@repo/auth/scopes.ts`
    - _Requirements: 7.1, 7.2_

  - [x] 2.3 Write unit tests for token utilities
    - Test token generation format (prefix, length, uniqueness)
    - Test hash determinism (same input = same hash)
    - Test format validation (valid/invalid tokens)
    - Test scope validation and checking
    - _Requirements: 1.1, 1.2, 1.3, 7.1, 7.2, 14.1_

- [x] 3. Bearer token authentication middleware

  - [x] 3.1 Implement bearerAuth middleware in apps/api

    - Extract token from `Authorization: Bearer <token>` header
    - Validate token format using `isValidTokenFormat()`
    - Hash token and query database for matching ApiKey record
    - Check revocation status (revokedAt)
    - Check expiration status (expiresAt)
    - Update lastUsedAt timestamp asynchronously
    - Attach userId, profileId, authType, tokenId, tokenScopes to request context
    - Emit audit events for all authentication failures (invalid format, not found, revoked, expired)
    - Emit audit event for successful token usage after request completes
    - Return 401 with generic error messages for all failures
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 13.2, 13.4, 14.4_

  - [x] 3.2 Implement requireScope middleware

    - Check authType from context (session vs PAT)
    - If session auth, allow request (full access)
    - If PAT auth, validate token has required scope using `hasScope()`
    - Emit audit event for scope denial before returning 403
    - Return 403 with required scope in error message if insufficient
    - _Requirements: 7.3, 7.4, 7.5, 13.5_

  - [x] 3.3 Update auth middleware priority

    - Check Bearer header first before session cookie
    - Fall back to session auth if no Bearer token present
    - Ensure both paths set userId and profileId in context
    - _Requirements: 6.1, 6.2_

  - [x] 3.4 Write integration tests for authentication
    - Test valid token authentication
    - Test invalid token format rejection
    - Test token not found rejection
    - Test revoked token rejection
    - Test expired token rejection
    - Test lastUsedAt timestamp update
    - Test scope enforcement (sufficient and insufficient)
    - Test session auth bypasses scope checks
    - Test audit event emission for all scenarios
    - _Requirements: 6.1-6.6, 7.3-7.5, 13.2, 13.4, 13.5_

- [x] 4. Token creation endpoint (POST /v1/tokens)

  - [x] 4.1 Implement token creation handler

    - Require session authentication (no PAT creation via PAT)
    - Validate request body: name (1-100 chars), scopes (array of valid scopes), expiresAt (optional, 1-365 days)
    - Check rate limit: 10 tokens per user per hour
    - Generate token using `generateToken()`
    - Extract last 4 characters before hashing
    - Hash token using `hashToken()`
    - Create ApiKey record with userId, profileId, name, keyHash, last4, scopes, expiresAt
    - Emit audit event for token creation
    - Return response with plaintext token, tokenId, name, scopes, createdAt, expiresAt
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1, 12.1_

  - [x] 4.2 Add Zod schema for request/response validation

    - Define CreateTokenRequest schema (name, scopes, expiresAt)
    - Define CreateTokenResponse schema (token, id, name, scopes, createdAt, expiresAt)
    - Validate scopes are in valid set
    - Validate expiresAt is between 1-365 days from now
    - _Requirements: 3.2, 7.2, 8.4_

  - [x] 4.3 Write integration tests for token creation
    - Test successful token creation
    - Test duplicate name rejection
    - Test invalid scope rejection
    - Test rate limit enforcement
    - Test expiration date validation
    - Test audit event emission
    - _Requirements: 3.1-3.6, 9.1, 12.2, 12.3, 13.1_

- [x] 5. Token listing endpoint (GET /v1/tokens)

  - [x] 5.1 Implement token list handler

    - Require session authentication
    - Query ApiKey records for authenticated user
    - Filter out revoked tokens (revokedAt IS NULL) or include with status indicator
    - Sort by createdAt DESC (newest first)
    - Return array of token metadata: id, name, last4 (masked as `sbf_****abcd`), scopes, createdAt, lastUsedAt, expiresAt
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 Add Zod schema for response validation

    - Define TokenListItem schema (id, name, maskedValue, scopes, createdAt, lastUsedAt, expiresAt)
    - Define ListTokensResponse schema (array of TokenListItem)
    - _Requirements: 4.3, 4.4_

  - [x] 5.3 Write integration tests for token listing
    - Test listing returns user's tokens only
    - Test tokens are sorted by creation date
    - Test token values are properly masked
    - Test lastUsedAt is included
    - _Requirements: 4.1-4.5_

- [x] 6. Token revocation endpoint (DELETE /v1/tokens/:id)

  - [x] 6.1 Implement token revocation handler

    - Require session authentication
    - Validate token ID parameter
    - Query ApiKey record and verify ownership (userId matches)
    - Return 404 if token not found or belongs to different user
    - Soft delete by setting revokedAt timestamp
    - Make operation idempotent (already revoked = 204)
    - Emit audit event for revocation (only on first revocation)
    - Return 204 No Content on success
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 13.3_

  - [x] 6.2 Write integration tests for token revocation
    - Test successful revocation
    - Test ownership verification (can't revoke other user's tokens)
    - Test idempotency (revoking twice works)
    - Test audit event emission
    - Test revoked tokens can't authenticate
    - _Requirements: 5.1-5.6, 13.3_

- [x] 7. Token name update endpoint (PATCH /v1/tokens/:id)

  - [x] 7.1 Implement token name update handler

    - Require session authentication
    - Validate token ID parameter and new name (1-100 chars)
    - Query ApiKey record and verify ownership
    - Check for duplicate name (unique per user)
    - Update name field only (no token regeneration)
    - Return updated token metadata
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

  - [x] 7.2 Write integration tests for name updates
    - Test successful name update
    - Test duplicate name rejection
    - Test ownership verification
    - Test token still works after name change
    - _Requirements: 12.1-12.5_

- [x] 8. Rate limiting for token operations

  - [x] 8.1 Add rate limit middleware to token endpoints

    - Apply 10 tokens/hour limit to POST /v1/tokens (per userId)
    - Apply 100 failed auth/hour limit to bearer auth middleware (per IP)
    - Use existing Upstash Redis rate limiter from @repo/rate-limit
    - Return 429 with Retry-After header when limit exceeded
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 8.2 Write integration tests for rate limiting
    - Test token creation rate limit enforcement
    - Test failed auth rate limit enforcement
    - Test successful auth not rate limited
    - Test Retry-After header presence
    - _Requirements: 9.1-9.5_

- [x] 9. Audit logging integration

  - [x] 9.1 Verify audit event types in @repo/auth

    - Ensure authEvents supports: token.created, token.used, token.revoked, token.auth_failed, token.scope_denied
    - Add TypeScript types for each event payload
    - _Requirements: 13.1-13.5_

  - [x] 9.2 Configure Pino logger for token events

    - Ensure Authorization header redaction in logs
    - Ensure token prefix (sbf\_) redaction in logs
    - Add requestId to all audit events
    - _Requirements: 13.1-13.5, 14.2_

  - [x] 9.3 Write tests for audit logging
    - Test all event types are emitted correctly
    - Test sensitive data is redacted
    - Test requestId is included
    - _Requirements: 13.1-13.5_

- [ ] 10. Web UI for token management

  - [ ] 10.1 Create API Keys settings page

    - Add route at /settings/api-keys
    - Add navigation link in user settings menu
    - Fetch and display token list using GET /v1/tokens
    - Show token metadata: name, masked value, scopes, created date, last used date
    - Highlight tokens unused for 30+ days with warning indicator
    - Highlight tokens never used with distinct indicator
    - _Requirements: 10.1, 10.2, 11.3, 11.4, 11.5_

  - [ ] 10.2 Implement token creation modal

    - Add "Create API Key" button that opens modal
    - Form fields: name (required), scopes (multi-select), expiration (optional date picker)
    - Submit form to POST /v1/tokens
    - Display plaintext token in success modal with copy button
    - Show warning: "Save this token now. You won't be able to see it again."
    - Close modal after user confirms they've saved the token
    - _Requirements: 10.3, 10.4_

  - [ ] 10.3 Implement token revocation flow

    - Add "Revoke" button for each token in list
    - Show confirmation dialog: "Are you sure? This action cannot be undone."
    - Call DELETE /v1/tokens/:id on confirmation
    - Remove token from list on success
    - Show success toast notification
    - _Requirements: 10.5_

  - [ ] 10.4 Implement token name editing

    - Add inline edit button for token names
    - Show input field with current name
    - Call PATCH /v1/tokens/:id on save
    - Update list with new name
    - Show error if duplicate name
    - _Requirements: 12.5_

  - [ ] 10.5 Write E2E tests for web UI
    - Test full token creation flow (form → API → display plaintext)
    - Test token list displays correctly
    - Test token revocation flow with confirmation
    - Test name editing flow
    - Test unused token indicators
    - _Requirements: 10.1-10.5, 11.3-11.5, 12.5_

- [ ] 11. API documentation

  - [ ] 11.1 Document authentication methods

    - Add section to API docs explaining Bearer token auth
    - Include example requests with Authorization header
    - Document error responses (401, 403, 429)
    - Explain scope system and available scopes
    - _Requirements: 14.5_

  - [ ] 11.2 Document token management endpoints

    - Document POST /v1/tokens (creation)
    - Document GET /v1/tokens (listing)
    - Document DELETE /v1/tokens/:id (revocation)
    - Document PATCH /v1/tokens/:id (name update)
    - Include request/response examples for each
    - _Requirements: 3.1, 4.1, 5.1, 12.5_

  - [ ] 11.3 Document security best practices
    - Token storage recommendations (environment variables, secret managers)
    - Token rotation guidance (create new, test, revoke old)
    - Least privilege scope selection
    - Expiration policy recommendations
    - _Requirements: 14.5_

- [ ] 12. Integration with existing endpoints

  - [ ] 12.1 Add scope requirements to protected endpoints

    - Add `requireScope("read:transactions")` to GET /v1/transactions
    - Add `requireScope("write:transactions")` to transaction overlay endpoints
    - Add `requireScope("read:profile")` to GET /v1/profile
    - Add `requireScope("write:profile")` to PATCH /v1/profile
    - Document required scopes in endpoint comments
    - _Requirements: 7.3, 7.4_

  - [ ] 12.2 Write integration tests for scope enforcement
    - Test read-only token can GET but not POST
    - Test write token can POST
    - Test session auth bypasses scope checks
    - Test 403 response includes required scope
    - _Requirements: 7.3, 7.4, 7.5_
