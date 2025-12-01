# alignment.md — Auth Alignment To-Do

> Checklist for aligning the current auth implementation with the goal from `docs/auth-migration/end-auth-goal.md`.

---

1. [x] Update Auth.js Config (`packages/auth/src/config.ts`)
   - Context: Auth.js currently issues opaque session tokens, but `AuthCoreService` expects signed JWTs.
   - Sanity check: Confirm current Auth.js tokens are opaque (not JWTs) and cannot be verified by `AuthCoreService.verifyRequest`.
   - Details:
     - Modify the `jwt` callback to **issue a signed JWT** (using `AuthCoreService` signing keys) instead of returning the opaque session token.
     - The JWT should contain:
       - `sub` (userId)
       - `sid` (sessionId)
     - The JWT must be signed by the `AuthCoreService` issuer.

2. [x] Implement Refresh Token Rotation
   - Context: Refresh tokens are issued via the `Token` table; `createSessionWithRefresh` and `/v1/auth/refresh` already use `AuthCoreService.issueRefreshToken`.
   - Details:
     - `AuthCoreService.createSessionWithRefresh` issues `Token` records of type `refresh` alongside sessions.
     - `/v1/auth/refresh` rotates tokens via `AuthCoreService.issueRefreshToken`, revokes the prior token, and preserves family IDs.

3. [x] Verify Middleware Behavior
   - Context: `AuthCoreService.verifyRequest` is intended to verify JWTs (and PATs) once Auth.js issues JWTs instead of opaque session tokens.
   - Details:
     - [x] Once Auth.js issues JWTs, confirm that `AuthCoreService.verifyRequest` correctly verifies them.
     - [x] Ensure API requests using `Authorization: Bearer <JWT>` authenticate successfully and build the expected auth context.
