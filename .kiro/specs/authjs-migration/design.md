# Phase 2.1: Full Auth.js Migration - Design

## Architecture Overview

This migration transforms our hybrid Auth.js approach into a full Auth.js implementation while maintaining backward compatibility with existing sessions and PAT authentication.

### Current Architecture (Phase 2 Hybrid)

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Client                            │
│  - Custom login/register forms                              │
│  - Calls /v1/login, /v1/register directly                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Hono API Server                         │
│                                                              │
│  Custom Routes:                                              │
│  - POST /v1/login    → Manual JWT encode                    │
│  - POST /v1/register → Manual user creation                 │
│  - POST /v1/logout   → Clear cookie                         │
│  - GET  /v1/me       → Manual JWT decode                    │
│                                                              │
│  Auth Middleware:                                            │
│  - Extract JWT from cookie                                   │
│  - Decode using @auth/core/jwt                              │
│  - Attach userId, profileId to context                      │
│                                                              │
│  PAT Middleware (Phase 3):                                   │
│  - Extract Bearer token from header                          │
│  - Hash and lookup in database                              │
│  - Attach userId, profileId, scopes to context              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Postgres (Neon)                           │
│  - users (with password field)                               │
│  - accounts (unused, for future OAuth)                       │
│  - sessions (unused, JWT strategy)                           │
│  - verification_tokens (unused)                              │
│  - profiles (business data)                                  │
│  - api_keys (PAT tokens)                                     │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture (Phase 2.1 Full Auth.js)

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Client                            │
│  - OAuth provider buttons (Google, GitHub)                   │
│  - Magic link email input                                    │
│  - Traditional email/password form                           │
│  - Uses Auth.js signIn() method                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Hono API Server                         │
│                                                              │
│  Auth.js Handler (NEW):                                      │
│  - ALL /v1/auth/* → Auth.js Hono adapter                    │
│    - /v1/auth/signin/google → OAuth flow                    │
│    - /v1/auth/signin/github → OAuth flow                    │
│    - /v1/auth/signin/email → Magic link                     │
│    - /v1/auth/signin/credentials → Email/password           │
│    - /v1/auth/callback/* → OAuth callbacks                  │
│    - /v1/auth/signout → Clear session                       │
│                                                              │
│  Custom Routes (DEPRECATED, kept for rollback):              │
│  - POST /v1/login    → Redirect to Auth.js                  │
│  - POST /v1/register → Redirect to Auth.js                  │
│  - POST /v1/logout   → Redirect to Auth.js                  │
│                                                              │
│  Auth Middleware (UPDATED):                                  │
│  - Check Bearer token first (PAT auth)                       │
│  - If no Bearer, check Auth.js session                       │
│  - Extract userId, profileId from session                    │
│  - Attach to context                                         │
│                                                              │
│  PAT Middleware (UNCHANGED):                                 │
│  - Extract Bearer token from header                          │
│  - Hash and lookup in database                              │
│  - Attach userId, profileId, scopes to context              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Postgres (Neon)                           │
│  - users (with password field)                               │
│  - accounts (NOW USED for OAuth)                            │
│  - sessions (still unused, JWT strategy)                     │
│  - verification_tokens (NOW USED for magic links)           │
│  - profiles (business data)                                  │
│  - api_keys (PAT tokens)                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
│  - Google OAuth                                              │
│  - GitHub OAuth                                              │
│  - Email Service (SendGrid/Postmark/Resend)                 │
└─────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Auth.js Hono Adapter Integration

**File**: `apps/api/src/auth.ts` (new file)

**Purpose**: Configure and export Auth.js handler for Hono

**Implementation**:

```typescript
// apps/api/src/auth.ts
import { Hono } from 'hono';
import { authHandler } from '@auth/hono';
import { authConfig } from '@repo/auth';

const authApp = new Hono();

// Mount Auth.js handler at /auth/*
authApp.use('/*', authHandler(authConfig));

export { authApp };
```

**Integration in main app**:

```typescript
// apps/api/src/app.ts
import { authApp } from './auth.js';

// Mount Auth.js routes
app.route('/v1/auth', authApp);
```

### 2. OAuth Provider Configuration

**File**: `packages/auth/src/config.ts` (update existing)

**Changes**: Add Google and GitHub providers

```typescript
import Google from '@auth/core/providers/google';
import GitHub from '@auth/core/providers/github';
import Email from '@auth/core/providers/email';

export const authConfig: AuthConfig = {
  basePath: '/v1/auth',
  adapter: PrismaAdapter(prisma),
  providers: [
    // Existing Credentials provider
    Credentials({ /* ... */ }),
    
    // NEW: Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // Link by email
    }),
    
    // NEW: GitHub OAuth
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // Link by email
    }),
    
    // NEW: Email magic links
    Email({
      server: process.env.EMAIL_SERVER!,
      from: process.env.EMAIL_FROM!,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Create profile record for new users
      if (account?.provider !== 'credentials') {
        await ensureProfileExists(user.id);
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.email = user.email ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
};
```

### 3. Profile Creation Helper

**File**: `packages/auth/src/profile.ts` (new file)

**Purpose**: Ensure profile record exists for OAuth users

```typescript
import { prisma } from '@repo/database';

export async function ensureProfileExists(userId: string): Promise<void> {
  const existing = await prisma.profile.findUnique({
    where: { userId },
  });

  if (!existing) {
    await prisma.profile.create({
      data: {
        userId,
        timezone: 'UTC',
        currency: 'USD',
      },
    });
  }
}
```

### 4. Auth Middleware Update

**File**: `apps/api/src/middleware/auth.ts` (update existing)

**Changes**: Support both PAT and Auth.js sessions

```typescript
export async function authMiddleware(c: Context, next: Next) {
  try {
    // PRIORITY 1: Check for Bearer token (PAT authentication)
    const authHeader = c.req.header('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return await patAuthMiddleware(c, next);
    }

    // PRIORITY 2: Check for Auth.js session
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Decode Auth.js JWT
    const decoded = await decode({
      token,
      secret: authConfig.secret!,
      salt: JWT_SALT,
    });

    if (!decoded || !decoded.id) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // Attach user context
    c.set('userId', decoded.id as string);
    c.set('userEmail', decoded.email as string);
    c.set('authType', 'session');

    // Fetch and attach profileId
    const profile = await prisma.profile.findUnique({
      where: { userId: decoded.id as string },
      select: { id: true },
    });

    if (profile) {
      c.set('profileId', profile.id);
    }

    await next();
  } catch (error) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
}
```

### 5. Web Client OAuth Integration

**File**: `apps/web/src/pages/Login.tsx` (update existing)

**Changes**: Add OAuth buttons

```typescript
import { signIn } from '@auth/react'; // or custom implementation

export function Login() {
  const handleGoogleLogin = async () => {
    await signIn('google', { callbackUrl: '/' });
  };

  const handleGitHubLogin = async () => {
    await signIn('github', { callbackUrl: '/' });
  };

  const handleMagicLink = async (email: string) => {
    await signIn('email', { email, callbackUrl: '/' });
  };

  return (
    <div>
      {/* OAuth Buttons */}
      <button onClick={handleGoogleLogin}>
        Sign in with Google
      </button>
      <button onClick={handleGitHubLogin}>
        Sign in with GitHub
      </button>

      {/* Magic Link */}
      <form onSubmit={(e) => {
        e.preventDefault();
        handleMagicLink(email);
      }}>
        <input type="email" placeholder="Enter your email" />
        <button type="submit">Send magic link</button>
      </form>

      {/* Traditional Email/Password */}
      <form onSubmit={handleCredentialsLogin}>
        {/* Existing form */}
      </form>
    </div>
  );
}
```

## Data Flow Diagrams

### OAuth Flow (Google Example)

```
1. User clicks "Sign in with Google"
   │
   ▼
2. Web client calls signIn('google')
   │
   ▼
3. Redirects to /v1/auth/signin/google
   │
   ▼
4. Auth.js generates OAuth state parameter
   │
   ▼
5. Redirects to Google consent screen
   │
   ▼
6. User approves consent
   │
   ▼
7. Google redirects to /v1/auth/callback/google?code=...&state=...
   │
   ▼
8. Auth.js validates state parameter
   │
   ▼
9. Auth.js exchanges code for access token
   │
   ▼
10. Auth.js fetches user profile from Google
    │
    ▼
11. Auth.js checks if user exists by email
    │
    ├─ Exists: Link Google account to existing user
    │
    └─ New: Create user + profile records
    │
    ▼
12. Auth.js creates JWT session
    │
    ▼
13. Sets httpOnly cookie
    │
    ▼
14. Redirects to callbackUrl (/)
    │
    ▼
15. User logged in
```

### Magic Link Flow

```
1. User enters email and clicks "Send magic link"
   │
   ▼
2. Web client calls signIn('email', { email })
   │
   ▼
3. Auth.js generates verification token
   │
   ▼
4. Stores token in verification_tokens table
   │
   ▼
5. Sends email with magic link
   │
   ▼
6. User clicks magic link in email
   │
   ▼
7. Redirects to /v1/auth/callback/email?token=...&email=...
   │
   ▼
8. Auth.js validates token
   │
   ▼
9. Auth.js checks if user exists
   │
   ├─ Exists: Log in existing user
   │
   └─ New: Create user + profile records
   │
    ▼
10. Auth.js creates JWT session
    │
    ▼
11. Sets httpOnly cookie
    │
    ▼
12. Marks token as used (delete from verification_tokens)
    │
    ▼
13. Redirects to callbackUrl (/)
    │
    ▼
14. User logged in
```

## Database Schema Usage

### accounts Table (NOW USED)

Stores OAuth account linkages:

```sql
INSERT INTO accounts (
  userId,
  type,
  provider,
  providerAccountId,
  access_token,
  refresh_token,
  expires_at,
  token_type,
  scope,
  id_token
) VALUES (
  'user_123',
  'oauth',
  'google',
  'google_user_id',
  'encrypted_access_token',
  'encrypted_refresh_token',
  1234567890,
  'Bearer',
  'openid email profile',
  'jwt_id_token'
);
```

### verification_tokens Table (NOW USED)

Stores magic link tokens:

```sql
INSERT INTO verification_tokens (
  identifier,  -- email address
  token,       -- hashed token
  expires      -- 24 hours from now
) VALUES (
  'user@example.com',
  'hashed_token_value',
  '2025-01-16 10:00:00'
);
```

## Security Considerations

### OAuth State Parameter

- Generated by Auth.js automatically
- Stored in session cookie
- Validated on callback to prevent CSRF
- Expires after 10 minutes

### PKCE Flow

- Used for Google and GitHub OAuth
- Code verifier generated client-side
- Code challenge sent to provider
- Prevents authorization code interception

### Magic Link Tokens

- 32 bytes of cryptographic randomness
- Hashed before storage (SHA-256)
- One-time use (deleted after use)
- Expires after 24 hours
- Rate limited (3 per hour per email)

### Account Linking

- `allowDangerousEmailAccountLinking: true` enables linking by email
- Risk: Email takeover if OAuth provider doesn't verify emails
- Mitigation: Only use trusted providers (Google, GitHub verify emails)
- Alternative: Require manual account linking (future enhancement)

## Migration Strategy

### Phase 1: Parallel Deployment (Week 1)

1. Install `@auth/hono` package
2. Create Auth.js handler at `/v1/auth/*`
3. Keep existing custom routes at `/v1/login`, `/v1/register`, etc.
4. Test Auth.js handlers in development
5. Verify session format compatibility

**Rollback**: Remove Auth.js handler, keep custom routes

### Phase 2: OAuth Setup (Week 1-2)

1. Register OAuth apps (Google, GitHub)
2. Add OAuth providers to Auth.js config
3. Test OAuth flows in development
4. Add OAuth buttons to web client
5. Deploy to preview environment

**Rollback**: Remove OAuth providers from config, hide OAuth buttons

### Phase 3: Magic Links (Week 2)

1. Choose email service (SendGrid, Postmark, or Resend)
2. Configure Email provider in Auth.js config
3. Create email template
4. Test magic link flow
5. Add magic link UI to web client

**Rollback**: Remove Email provider from config, hide magic link UI

### Phase 4: Middleware Migration (Week 2)

1. Update auth middleware to support Auth.js sessions
2. Ensure PAT authentication still works
3. Run all 102 existing tests
4. Fix any test failures
5. Deploy to preview environment

**Rollback**: Revert middleware changes

### Phase 5: Cutover and Cleanup (Week 3)

1. Update web client to use Auth.js exclusively
2. Deprecate custom auth routes (keep for 1 week)
3. Monitor for issues
4. After 1 week, remove custom routes
5. Update documentation

**Rollback**: Revert web client changes, re-enable custom routes

## Testing Strategy

### Unit Tests

- OAuth provider configuration
- Profile creation helper
- Auth middleware logic
- Magic link token generation

### Integration Tests

- Auth.js handler responds correctly
- OAuth callback handling
- Magic link token validation
- Account linking by email
- Session creation and validation

### E2E Tests

- Complete OAuth flow (Google, GitHub)
- Complete magic link flow
- Existing email/password flow
- PAT authentication unchanged
- Session persistence across page loads

### Migration Tests

- Existing JWT sessions still valid
- PAT authentication still works
- All 102 existing tests pass
- No forced logouts during migration

## Monitoring and Observability

### Metrics to Track

- OAuth success rate (by provider)
- OAuth failure rate (by error type)
- Magic link delivery time
- Magic link usage rate
- Session validation latency
- PAT authentication latency

### Logs to Capture

- OAuth sign-in attempts (success, failure, cancellation)
- Magic link requests (sent, used, expired)
- Account linking events (new account, existing account)
- Auth.js debug logs (development only)

### Alerts to Configure

- OAuth success rate < 90%
- Magic link delivery time > 60 seconds
- Auth.js handler errors > 10 per minute
- PAT authentication failures spike

## Rollback Procedure

If critical issues arise:

1. **Immediate**: Disable Auth.js handler in production
2. **Revert**: Web client to use custom routes
3. **Monitor**: Ensure custom routes working
4. **Investigate**: Root cause in preview environment
5. **Fix**: Address issues
6. **Redeploy**: When ready

**Rollback Time**: < 5 minutes

## Open Design Questions

1. **Email Service Choice**
   - SendGrid: $15/month for 40k emails
   - Postmark: $15/month for 10k emails
   - Resend: $20/month for 50k emails
   - **Recommendation**: Resend (best pricing, modern API)

2. **Magic Link Email Template**
   - Plain text vs. HTML
   - Branding (logo, colors)
   - **Recommendation**: Start with plain text, add HTML later

3. **OAuth Button Styling**
   - Use provider brand guidelines
   - Custom styling vs. default buttons
   - **Recommendation**: Follow provider guidelines

4. **Account Linking Strategy**
   - Automatic by email (current design)
   - Manual linking (future enhancement)
   - **Recommendation**: Start with automatic, add manual later

5. **Apple OAuth Support**
   - Requires Apple Developer account ($99/year)
   - **Recommendation**: Add if user demand exists

## Success Criteria

Phase 2.1 design is complete when:

- [ ] Architecture diagrams reviewed and approved
- [ ] Component designs detailed and clear
- [ ] Data flow diagrams accurate
- [ ] Security considerations addressed
- [ ] Migration strategy defined
- [ ] Testing strategy comprehensive
- [ ] Monitoring plan in place
- [ ] Rollback procedure documented
- [ ] Open questions resolved
