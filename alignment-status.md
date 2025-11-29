# Auth Alignment Status

This document compares the current codebase implementation against the architecture goals defined in `docs/auth-migration/end-auth-goal.md`.

**Status**: 🚧 **In Progress / Misaligned**
The codebase contains the target architecture components (`packages/auth-core`), but the active Auth.js configuration (`packages/auth`) and API middleware are not fully aligned, potentially causing authentication failures or inconsistent behavior.

---

## 1. High-Level Architecture

| Component | Goal | Current State | Status |
| :--- | :--- | :--- | :--- |
| **Auth Core** | Centralized logic in `packages/auth-core`. | Exists (`packages/auth-core`) and implements `AuthCoreService`. | ✅ Aligned |
| **IdP Agnostic** | `UserIdentity` links external IdP to internal `User`. | Database schema supports this. `AuthCoreService` handles identity linking. | ✅ Aligned |
| **Auth Context** | Derived server-side (`userId`, `sessionId`, `scopes`, `activeWorkspaceId`). | `AuthCoreService.verifyRequest` builds this context correctly. | ✅ Aligned |
| **Middleware** | Unified middleware delegating to Auth Core. | `auth-unified.ts` and `auth-context.ts` exist and use `AuthCoreService`. | ✅ Aligned |

## 2. Token Strategy (Critical Misalignment)

The most significant gap is in how tokens are issued and verified.

| Feature | Goal | Current State | Status |
| :--- | :--- | :--- | :--- |
| **Access Tokens** | **Short-lived JWTs** (stateless signature check + DB validation). | **Opaque Session Tokens**. `packages/auth/src/config.ts` (Auth.js) issues opaque tokens. `AuthCoreService` expects JWTs. | ❌ **Misaligned** |
| **Refresh Tokens** | Long-lived, opaque, hashed, rotated. | `Session` table acts as refresh token storage. `Token` table has `refresh` type support in schema/service, but Auth.js config doesn't seem to use it yet. | ⚠️ Partial |
| **PATs** | Long-lived, opaque, hashed, scoped. | `packages/auth/src/pat.ts` and `AuthCoreService` implement this correctly. | ✅ Aligned |
| **Verification** | Middleware verifies JWTs or PATs. | `AuthCoreService.verifyRequest` handles JWTs and PATs. **It does NOT support the opaque session tokens currently issued by Auth.js.** | ❌ **Broken** |

**Impact**:
- Clients logging in via Auth.js receive an opaque session token.
- If they send this token as `Authorization: Bearer <token>`:
    - `AuthCoreService.verifyRequest` parses it as an opaque token.
    - It attempts to verify it as a **PAT** (`verifyPersonalAccessToken`).
    - This fails because the token is a session token, not a PAT.
- **Result**: API requests authenticated with standard session tokens will likely fail with 401 Unauthorized.

## 3. Database Schema

| Entity | Goal | Current State | Status |
| :--- | :--- | :--- | :--- |
| **User** | Internal user with `status`. | Matches. | ✅ Aligned |
| **UserIdentity** | Link to IdP. | Matches. | ✅ Aligned |
| **Session** | Represents login, `absoluteExpiresAt`, `kind`. | Matches. | ✅ Aligned |
| **Token** | Refresh tokens & PATs. | Matches. | ✅ Aligned |
| **Workspace** | Multi-tenant units. | Matches. | ✅ Aligned |

## 4. Next Steps (Recommendations)

To align the implementation with the goal:

1.  **Update Auth.js Config (`packages/auth/src/config.ts`)**:
    - Modify the `jwt` callback to **issue a signed JWT** (using `AuthCoreService` signing keys) instead of returning the opaque session token.
    - The JWT should contain the `sub` (userId), `sid` (sessionId), and be signed by the `AuthCoreService` issuer.
2.  **Implement Refresh Token Rotation**:
    - Ensure `AuthCoreService.createSession` (or the Auth.js adapter) creates a `Token` (type `refresh`) in addition to the `Session`.
    - Update the `/v1/auth/refresh` endpoint to use `AuthCoreService.issueRefreshToken`.
3.  **Verify Middleware**:
    - Once Auth.js issues JWTs, `AuthCoreService.verifyRequest` should correctly verify them.
