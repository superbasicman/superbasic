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
