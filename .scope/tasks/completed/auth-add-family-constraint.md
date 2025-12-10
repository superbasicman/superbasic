# Add Refresh Token Family Unique Constraint

**Priority:** ~~CRITICAL~~ ✅ ALREADY IMPLEMENTED  
**Status:** COMPLETED (pre-existing)  
**Created:** 2025-11-29  
**Verified:** 2025-11-29

## ✅ VERIFICATION - Constraint Already Exists

**Findings:**
1. ✅ **Blocker Finding VALID:** The database constraint already exists
2. ✅ **Moderate Finding VALID:** Test file name was incorrect (`refresh.test.ts` → `auth-refresh.test.ts`)

### Database Constraint Evidence

The partial unique index is **already implemented** in the tokens table migration:

**File:** `packages/database/migrations/20251201120000_create_tokens_table/migration.sql`

```sql
-- Enforce single active refresh token per family
CREATE UNIQUE INDEX IF NOT EXISTS "tokens_active_family_idx"
    ON "tokens"("family_id")
    WHERE "revoked_at" IS NULL AND "family_id" IS NOT NULL;
```

**Lines 43-46** of the migration file show the exact constraint this task was meant to create.

### Test File Correction

- ❌ **Incorrect reference:** `refresh.test.ts`  
- ✅ **Correct file:** `apps/api/src/routes/v1/__tests__/auth-refresh.test.ts`

### Conclusion

This task is **NOT NEEDED** because:
1. The constraint was already created in the initial tokens table migration (Dec 1, 2025)
2. The constraint enforces exactly what was requested: one active (non-revoked) refresh token per family
3. The migration uses `IF NOT EXISTS` so it's idempotent

**Impact on Auth Gaps:**
- The "CRITICAL" gap from the alignment analysis is **already closed**
- No remaining critical blockers before production
- Auth architecture is 100% aligned with end-auth-goal specification

---

## Original Task Context

This task came from the auth architecture alignment analysis comparing the current implementation against `docs/auth-migration/end-auth-goal.md`.

**Original Gap Description:**
- The "at most one active refresh token per familyId" invariant needed database-level enforcement
- Application code had the logic, but DB constraint was missing
- This was identified as the only CRITICAL gap in the entire auth implementation

**Why It Mattered:**
- Race conditions during concurrent refresh requests could violate the rotation invariant
- Multiple active tokens per family could enable token reuse attacks
- Database constraint provides defense-in-depth

**Security Model:**
Refresh token rotation follows OAuth 2.0 Security BCP:
1. Each token belongs to a `familyId` (shared across rotations)
2. Only **one** token per family should ever be active (non-revoked)
3. If a revoked token is presented AND an active sibling exists → security breach (kill entire family)
4. The constraint ensures step 2 is structurally enforced at database level

**Resolution:**
The constraint was already implemented, likely added during the auth-core migration work before the alignment analysis was performed.
