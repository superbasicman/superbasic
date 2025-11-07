# Security Hardening Tasks

1. [x] **HIGH** Enforce non-empty, high-entropy `AUTH_SECRET` at startup and rotate existing session tokens once fixed.  
   _Refs:_ packages/auth/src/config.ts, apps/api/src/middleware/auth.ts

2. [x] **HIGH** Fix the failed-auth rate limiter so successful PAT requests do not increment the failure counter (currently every request consumes quota and triggers 429s).  
   _Refs:_ apps/api/src/middleware/rate-limit/failed-auth-tracking.ts, packages/rate-limit/src/index.ts  
   • [x] Expose a read-only helper in the rate-limit package (or use the same abstraction) to avoid mixing direct Redis calls with the limiter contract.  
   • [x] Align key naming between `trackFailedAuth` and the read path (single source for the prefix).  
   • [x] Clean up small nits: consistent guards, shared window constants, and structured rate-limit logging.  
   • [x] Return rate-limit status (or emit an event) when the failed-auth ceiling is hit so callers can react.

3. [x] **MEDIUM** Remove or redact magic-link email logging to avoid leaking PII in application logs.  
   _Refs:_ packages/auth/src/config.ts, packages/auth/src/email.ts

4. [x] **MEDIUM** Disable or narrow the service worker’s caching of authenticated API responses to prevent sensitive data from persisting offline.  
   _Refs:_ apps/web/vite.config.ts

5. [x] **HIGH** Replace wildcard Vercel CORS matches with an explicit allowlist to keep credentials from leaking to attacker-controlled previews.  
   _Refs:_ apps/api/src/middleware/cors.ts, apps/api/src/auth.ts

6. [x] **HIGH** Add per-IP throttling (and audit hooks) to the Auth.js credentials callback so brute force attempts are rate limited like other auth surfaces.  
   _Refs:_ apps/api/src/app.ts, apps/api/src/auth.ts, apps/api/src/middleware/rate-limit

7. [x] **MEDIUM** Ensure the sign-out response mirrors the original cookie attributes (including `Secure`) so the session cookie actually clears in production.  
   _Refs:_ apps/api/src/auth.ts, packages/auth/src/constants.ts
