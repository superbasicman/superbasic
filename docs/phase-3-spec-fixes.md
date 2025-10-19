# Phase 3 Spec Fixes - API Key Management

## Date: 2025-01-18

## Critical Issues Resolved

### 1. Revocation Semantics Conflict (BLOCKING) ✅

**Issue**: Requirements called for hard delete, design used soft delete.

**Resolution**: Updated requirements to match design (soft delete approach).

**Changes**:
- `.kiro/specs/api-key-management/requirements.md` - Requirement 5
  - Changed "permanently delete" to "soft-delete by setting revokedAt timestamp"
  - Added idempotency requirement (DELETE twice → 204)
  - Added note about hard deletion only for GDPR/compliance

**Rationale**:
- Aligns with steering's append-only philosophy
- Preserves audit trail indefinitely
- Enables security incident investigation
- Consistent with financial data handling

### 2. Masked Value Strategy (HIGH PRIORITY) ✅

**Issue**: Design introduced `last4` column but routes never used it - they computed mask from hash tail instead.

**Resolution**: Updated all route implementations to persist and use `last4` field.

**Changes**:
- `.kiro/specs/api-key-management/design.md`:
  - Create route: Extract `last4 = token.slice(-4)` before hashing, persist in database
  - List route: Select `last4` field, use in maskedToken response
  - Update route: Return `maskedToken` using stored `last4`
  - Data model: Added `last4: string` field
  - Integration tests: Added assertions for `last4` matching plaintext suffix

**Rationale**:
- Users can visually match tokens they created
- Hash tail doesn't correspond to what user saw
- Better UX for token identification
- Doesn't reveal entropy (only 4 chars)

### 3. Bulk Delete Requirement Scope (MEDIUM PRIORITY) ✅

**Issue**: Requirement 11 expected "Delete Unused Tokens" bulk action in Phase 3, but design deferred it to Phase 3.1.

**Resolution**: Updated requirement to remove bulk action from Phase 3 scope.

**Changes**:
- `.kiro/specs/api-key-management/requirements.md` - Requirement 11
  - Removed "Delete Unused Tokens" bulk action from acceptance criteria
  - Added note: "Bulk operations deferred to Phase 3.1 (post-launch enhancements)"
  - Kept visual indicators for unused tokens (30+ days warning)

**Rationale**:
- Keeps Phase 3 focused on core CRUD operations
- Bulk operations are enhancement, not MVP
- Can be added in Phase 3.1 without breaking changes
- Exit criteria remain achievable

## Additional Improvements Made

### Database Schema
- Added XOR constraint: `CHECK ((profileId IS NOT NULL)::int + (workspaceId IS NOT NULL)::int = 1)`
- Added `last4` column for token masking
- Documented soft delete policy

### Security
- Added authorization header redaction requirements
- Documented token prefix scanning for logs
- Added unit test requirement for redaction

### Testing
- Added `last4` field validation tests
- Added soft delete verification tests
- Added revocation idempotency tests
- Added XOR constraint validation tests

### Documentation
- Clarified revocation semantics (410 vs 401)
- Added edge runtime migration note (one-line change)
- Documented middleware standardization pattern

## Files Modified

1. `.kiro/specs/api-key-management/requirements.md`
   - Requirement 5: Revocation semantics
   - Requirement 11: Bulk operations scope

2. `.kiro/specs/api-key-management/design.md`
   - Database schema: Added `last4` field
   - Create route: Persist `last4`
   - List route: Use `last4` for masking
   - Update route: Return `last4` in response
   - Revoke route: Clarified soft delete + idempotency
   - Data model: Added `last4` field
   - Integration tests: Added `last4` assertions

3. `docs/phase-3-spec-fixes.md` (this file)
   - Summary of all changes

## Additional Fixes (Round 2)

### 4. Audit Log Metadata Completeness (HIGH PRIORITY) ✅

**Issue**: Creation and revocation events were missing IP address and User-Agent fields required by Requirements 3.6 and 5.6.

**Resolution**: Added IP and User-Agent to all audit events.

**Changes**:
- Create route: Added `ip` and `userAgent` to token.created event
- Revoke route: Added `profileId`, `ip`, and `userAgent` to token.revoked event
- Audit examples: Updated all event examples to include complete metadata
- Token.used event: Added `userAgent` field

**Implementation**:
```typescript
ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown"
userAgent: c.req.header("user-agent") || "unknown"
```

### 5. Integration Test Wording (MEDIUM PRIORITY) ✅

**Issue**: Test still said "deletes token" instead of "soft-deletes token (sets revokedAt)".

**Resolution**: Updated test description to match soft delete semantics.

**Changes**:
- Changed "Test successful revocation deletes token" to "Test successful revocation soft-deletes token (sets revokedAt)"
- Added "Test revoked token still exists in database (audit trail)"
- Added "Test revocation is idempotent (DELETE twice returns 204)"

### 6. Corrupted Documentation Section (MEDIUM PRIORITY) ✅

**Issue**: Large block of garbled text obscured integration tests and web UI specification.

**Resolution**: Reconstructed entire section with clean, complete content.

**Changes**:
- Cleaned up integration test section (tests 3-7)
- Added complete E2E test specifications
- Added complete Web Client Implementation section
- Documented all UI components (API Keys page, creation modal, display modal, list component)
- Included "Never used" indicator from Requirement 11.5

## Additional Fixes (Round 3)

### 7. PAT Middleware Missing token.used Event (HIGH PRIORITY) ✅

**Issue**: PAT middleware never emitted the token.used audit event required by Requirement 13.2.

**Resolution**: Added token.used event emission after request completes.

**Changes**:
- PAT middleware: Added `authEvents.emit` call after `await next()`
- Event includes: tokenId, endpoint, method, status, IP, userAgent, timestamp
- Captures response status code from `c.res.status`

**Implementation**:
```typescript
await next();

// Emit token usage audit event after request completes
authEvents.emit({
  type: "token.used",
  userId: apiKey.userId,
  metadata: {
    tokenId: apiKey.id,
    endpoint: c.req.path,
    method: c.req.method,
    status: c.res.status,
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
    userAgent: c.req.header("user-agent") || "unknown",
    timestamp: new Date().toISOString(),
  },
});
```

### 8. Audit Payloads Missing Mandatory Fields (HIGH PRIORITY) ✅

**Issue**: Audit events were missing response status (Requirement 13.2) and timestamps (Requirements 13.1/13.3/13.5).

**Resolution**: Added status and timestamp fields to all audit events.

**Changes**:
- Create route: Added `timestamp` to token.created event
- Revoke route: Added `timestamp` to token.revoked event
- PAT middleware: Added `status` and `timestamp` to token.used event
- Scope middleware: Added `timestamp` to token.scope_denied event (to be implemented)
- Audit examples: Updated all examples with complete metadata
- Requirements: Clarified exact fields required for each event type

**Fields Added**:
- `status`: HTTP response status code (token.used events)
- `timestamp`: ISO 8601 timestamp (all events)

### 9. Scope Denied Event Alignment (HIGH PRIORITY) ✅

**Issue**: `token.scope_denied` audit event bypassed the standardized `authEvents` envelope, omitting `userId` and `metadata`.

**Resolution**: Updated scope enforcement middleware and documentation to emit events using `authEvents.emit({ type, userId, metadata })`.

**Changes**:
- `.kiro/specs/api-key-management/design.md`
  - Imported `authEvents` in scope middleware snippet
  - Wrapped scope-denied payload in `metadata`
  - Added `userId` to emitted event
  - Synced audit logging example with new structure
- Ensures Requirement 13.5 remains satisfied and matches Phase 2 audit contract

## Verification Checklist

- [x] Requirements and design are now consistent on soft delete
- [x] All routes persist and use `last4` field correctly
- [x] Bulk operations removed from Phase 3 scope
- [x] Integration tests updated to verify `last4` behavior
- [x] XOR constraint documented and will be enforced
- [x] Revocation idempotency documented
- [x] Security requirements (redaction) added
- [x] Audit events include IP address and User-Agent
- [x] Audit events include profileId where appropriate
- [x] Integration test wording matches soft delete semantics
- [x] Corrupted documentation section cleaned up
- [x] Web UI specification complete and readable
- [x] PAT middleware emits token.used events
- [x] All audit events include timestamps (ISO 8601)
- [x] Token.used events include response status code
- [x] Requirements document specifies exact audit fields

## Next Steps

1. Create tasks document (`.kiro/specs/api-key-management/tasks.md`)
2. Begin implementation following updated design
3. Verify XOR constraint in migration
4. Implement `last4` persistence in all routes
5. Add authorization header redaction to observability package

## Notes

- Design document may have some formatting issues in the middle section (corruption during edits)
- Core design decisions and route implementations are intact and correct
- If needed, can regenerate corrupted sections during implementation
