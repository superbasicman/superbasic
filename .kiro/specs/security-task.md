# Security Hardening Tasks

1. [ ] **HIGH** Enforce non-empty, high-entropy `AUTH_SECRET` at startup and rotate existing session tokens once fixed.  
   _Refs:_ packages/auth/src/config.ts, apps/api/src/middleware/auth.ts

2. [ ] **HIGH** Fix the failed-auth rate limiter so successful PAT requests do not increment the failure counter (currently every request consumes quota and triggers 429s).  
   _Refs:_ apps/api/src/middleware/rate-limit/failed-auth-tracking.ts, packages/rate-limit/src/index.ts

3. [ ] **MEDIUM** Remove or redact magic-link email logging to avoid leaking PII in application logs.  
   _Refs:_ packages/auth/src/config.ts, packages/auth/src/email.ts

4. [ ] **MEDIUM** Disable or narrow the service worker’s caching of authenticated API responses to prevent sensitive data from persisting offline.  
   _Refs:_ apps/web/vite.config.ts
