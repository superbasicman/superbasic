# Current Phase Context

**Active Phase**: Phase 3 - API Key Management  
**Status**: Requirements complete, design and implementation pending  
**Spec Location**: `.kiro/specs/api-key-management/`

## Phase 3 Overview

Enable programmatic API access through Personal Access Tokens (PATs) with secure generation, storage, and lifecycle management.

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

- [ ] Users can create API keys with custom names and scopes
- [ ] Plaintext token shown once on creation, never retrievable again
- [ ] API requests with `Authorization: Bearer <token>` authenticate successfully
- [ ] Invalid, expired, or revoked tokens return 401 with clear error message
- [ ] Token scopes enforced on protected endpoints (e.g., read-only tokens can't POST)
- [ ] Users can list their tokens (masked values, metadata visible)
- [ ] Users can revoke tokens with confirmation dialog
- [ ] Audit log records token creation, usage, and revocation
- [ ] Integration tests cover full token lifecycle
- [ ] Documentation includes API authentication guide with examples

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

## Next Phase Preview

**Phase 4**: Plaid Integration - Bank Connections  
**Goal**: Connect bank accounts via Plaid Link and sync account metadata  
**Blocker**: Requires Plaid developer account setup (Sandbox environment)  
**Key Deliverables**: Link token creation, public token exchange, account sync, webhook handler

---

## Related Documentation

- **Full Roadmap**: `docs/project_plan.md` - Complete 18-phase plan with all details
- **Phase Summaries**: `docs/phase-1-readme.md`, `docs/phase-2-readme.md`
- **Database Schema**: `.kiro/steering/database-schema.md` - Complete schema reference
- **File Reference**: `docs/open-files.md` - Key files to track for context

---

**Last Updated**: 2025-01-18  
**Update Trigger**: Update this file at the start of each new phase or when phase status changes significantly
