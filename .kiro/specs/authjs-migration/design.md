# Phase 2.1: Full Auth.js Migration - Design

## Architecture Decision: REST-First Integration

**Decision**: Keep web client as thin REST consumer. Auth.js lives entirely in API tier. No `@auth/react` dependency.

**Rationale**:
- ✅ Maintains API-first architecture (web client is just another API consumer)
- ✅ Capacitor-ready (mobile apps use same REST endpoints)
- ✅ Minimal changes (update endpoints, add OAuth redirects)
- ✅ Testable (mock REST endpoints, not Auth.js internals)
- ✅ Future-proof (easy to add more auth providers)

**Key Technical Details**:
- Auth.js expects `application/x-www-form-urlencoded` (not JSON) for credential/email sign-in
- OAuth flow uses browser redirects, client polls `/v1/auth/session` after callback
- CORS must allow both web client and API origins for OAuth redirects
- No `@auth/react` - preserves thin client pattern and Capacitor compatibility
- Provider configuration remains additive—future providers (Apple, Microsoft, etc.) can be appended without touching client architecture

---

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
│  - Redirects to /v1/auth/* endpoints (REST pattern)         │
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
    // Future providers (e.g., Apple) can be added here without refactoring
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

### 5. Web Client Integration (REST-First Pattern)

**Architecture Decision**: Keep web client as thin REST consumer. Auth.js lives entirely in API tier. No `@auth/react` dependency - preserves API-first architecture and Capacitor compatibility.

#### 5.1 Update API Client with Auth.js Endpoints

**File**: `apps/web/src/lib/api.ts` (update existing)

**Changes**: Update `authApi` to call Auth.js handlers, add OAuth redirect methods, add form-encoded POST helper

```typescript
/**
 * Helper for form-encoded POST requests (Auth.js expects application/x-www-form-urlencoded)
 */
async function apiFormPost<T>(
  endpoint: string,
  data: Record<string, string>
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const formBody = new URLSearchParams(data).toString();

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });

  if (response.status === 401) {
    throw new ApiError('Unauthorized', 401);
  }

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      responseData.error || 'An error occurred',
      response.status,
      responseData.details
    );
  }

  return responseData;
}

export const authApi = {
  /**
   * Credentials login - POST to Auth.js callback endpoint
   * Auth.js expects form-encoded data, not JSON
   */
  async login(credentials: LoginInput): Promise<{ user: UserResponse }> {
    return apiFormPost('/v1/auth/callback/credentials', {
      email: credentials.email,
      password: credentials.password,
    });
  },

  /**
   * OAuth login - redirect to Auth.js signin endpoint
   * Auth.js handles OAuth flow and redirects back with session cookie
   */
  loginWithGoogle(): void {
    window.location.href = `${API_URL}/v1/auth/signin/google`;
  },

  loginWithGitHub(): void {
    window.location.href = `${API_URL}/v1/auth/signin/github`;
  },

  /**
   * Magic link - POST email to Auth.js
   * Auth.js sends email with verification link
   */
  async requestMagicLink(email: string): Promise<{ success: boolean }> {
    return apiFormPost('/v1/auth/signin/email', { email });
  },

  /**
   * Get current session - call Auth.js session endpoint
   */
  async me(): Promise<{ user: UserResponse }> {
    return apiFetch('/v1/auth/session', { method: 'GET' });
  },

  /**
   * Logout - POST to Auth.js signout endpoint
   */
  async logout(): Promise<void> {
    return apiFetch('/v1/auth/signout', { method: 'POST' });
  },

  /**
   * Register - keep existing endpoint (not part of Auth.js)
   * After registration, call login() to establish session
   */
  async register(data: RegisterInput): Promise<{ user: UserResponse }> {
    return apiFetch('/v1/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
```

#### 5.2 Update AuthContext for OAuth Callback Handling

**File**: `apps/web/src/contexts/AuthContext.tsx` (update existing)

**Changes**: Add OAuth callback detection, handle error query params, add new auth methods

```typescript
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Check auth status on initialization AND after OAuth callback
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Handle OAuth callback on return from provider
  useEffect(() => {
    handleOAuthCallback();
  }, [location]);

  /**
   * Detect OAuth callback and handle errors
   * Auth.js redirects back with ?error=... on failure
   */
  async function handleOAuthCallback() {
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    const callbackUrl = params.get('callbackUrl');

    // If error param present, show error and clear URL
    if (error) {
      console.error('OAuth error:', error);
      // TODO: Show error toast/notification
      navigate(location.pathname, { replace: true }); // Clear query params
      return;
    }

    // If returning from OAuth (has callbackUrl param), check session
    if (callbackUrl) {
      await checkAuthStatus();
      navigate(callbackUrl, { replace: true }); // Clear query params and redirect
    }
  }

  /**
   * Check if user is authenticated by calling /v1/auth/session
   */
  async function checkAuthStatus() {
    try {
      const { user: currentUser } = await authApi.me();
      setUser(currentUser);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      } else {
        console.error('Failed to check auth status:', error);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * OAuth login methods - redirect to Auth.js
   */
  function loginWithGoogle(): void {
    authApi.loginWithGoogle();
  }

  function loginWithGitHub(): void {
    authApi.loginWithGitHub();
  }

  /**
   * Magic link - request email with verification link
   */
  async function requestMagicLink(email: string): Promise<void> {
    await authApi.requestMagicLink(email);
    // Show success message: "Check your email for a magic link"
  }

  // ... existing login, register, logout methods stay the same

  const value: AuthContextType = {
    user,
    login,
    register,
    logout,
    loginWithGoogle,
    loginWithGitHub,
    requestMagicLink,
    isLoading,
    isAuthenticated: user !== null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

#### 5.3 Update Login Page with OAuth Buttons

**File**: `apps/web/src/pages/Login.tsx` (update existing)

**Changes**: Add OAuth buttons and magic link form

```typescript
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { login, loginWithGoogle, loginWithGitHub, requestMagicLink } = useAuth();
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleGoogleLogin = () => {
    loginWithGoogle(); // Redirects to /v1/auth/signin/google
  };

  const handleGitHubLogin = () => {
    loginWithGitHub(); // Redirects to /v1/auth/signin/github
  };

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    await requestMagicLink(email);
    setMagicLinkSent(true);
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

      <div>or</div>

      {/* Magic Link */}
      {!magicLinkSent ? (
        <form onSubmit={handleMagicLink}>
          <input type="email" placeholder="Enter your email" required />
          <button type="submit">Send magic link</button>
        </form>
      ) : (
        <p>Check your email for a magic link!</p>
      )}

      <div>or</div>

      {/* Traditional Email/Password (existing) */}
      <form onSubmit={handleCredentialsLogin}>
        {/* Existing form */}
      </form>
    </div>
  );
}
```

#### 5.4 CORS Configuration

**File**: `apps/api/src/app.ts` (update existing)

**Changes**: Add OAuth callback URLs to CORS allowed origins

```typescript
import { cors } from 'hono/cors';

app.use(
  '/v1/*',
  cors({
    origin: [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // API dev server (for OAuth callbacks)
      process.env.WEB_URL || 'https://app.superbasicfinance.com',
    ],
    credentials: true, // Required for cookies
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);
```

#### 5.5 Environment Variables

**File**: `apps/web/.env.example` (update)

```bash
# API URL for Auth.js redirects
VITE_API_URL=http://localhost:3000
```

**File**: `apps/api/.env.example` (update)

```bash
# OAuth callback base URL
NEXTAUTH_URL=http://localhost:3000

# Web client URL for post-auth redirects
WEB_URL=http://localhost:5173
```

## Data Flow Diagrams

### OAuth Flow (Google Example) - REST Pattern

```
1. User clicks "Sign in with Google"
   │
   ▼
2. Web client calls loginWithGoogle()
   │
   ▼
3. Browser redirects to: GET /v1/auth/signin/google
   │
   ▼
4. Auth.js generates OAuth state parameter
   │
   ▼
5. Auth.js redirects to Google consent screen
   │
   ▼
6. User approves consent on Google
   │
   ▼
7. Google redirects to: GET /v1/auth/callback/google?code=...&state=...
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
    └─ New: Create user + profile records (via signIn callback)
    │
    ▼
12. Auth.js creates JWT session
    │
    ▼
13. Auth.js sets httpOnly cookie
    │
    ▼
14. Auth.js redirects to: /?callbackUrl=/
    │
    ▼
15. Web client detects callbackUrl param
    │
    ▼
16. Web client calls GET /v1/auth/session
    │
    ▼
17. Auth.js returns user data
    │
    ▼
18. AuthContext updates state
    │
    ▼
19. Web client clears query params and redirects to /
    │
    ▼
20. User logged in
```

### OAuth Error Flow

```
1. OAuth fails (user cancels, invalid credentials, etc.)
   │
   ▼
2. Auth.js redirects to: /?error=OAuthAccountNotLinked&callbackUrl=/
   │
   ▼
3. Web client detects error param
   │
   ▼
4. Web client shows error message to user
   │
   ▼
5. Web client clears query params
   │
   ▼
6. User remains on login page
```

### Magic Link Flow - REST Pattern

```
1. User enters email and clicks "Send magic link"
   │
   ▼
2. Web client POSTs to: /v1/auth/signin/email
   Body: email=user@example.com (form-encoded)
   │
   ▼
3. Auth.js generates verification token
   │
   ▼
4. Auth.js stores token in verification_tokens table
   │
   ▼
5. Auth.js sends email with magic link
   │
   ▼
6. Web client shows "Check your email" message
   │
   ▼
7. User clicks magic link in email
   │
   ▼
8. Browser navigates to: GET /v1/auth/callback/email?token=...&email=...
   │
   ▼
9. Auth.js validates token (checks expiry, matches email)
   │
   ▼
10. Auth.js checks if user exists
    │
    ├─ Exists: Log in existing user
    │
    └─ New: Create user + profile records (via signIn callback)
    │
    ▼
11. Auth.js creates JWT session
    │
    ▼
12. Auth.js sets httpOnly cookie
    │
    ▼
13. Auth.js marks token as used (delete from verification_tokens)
    │
    ▼
14. Auth.js redirects to: /?callbackUrl=/
    │
    ▼
15. Web client detects callbackUrl param
    │
    ▼
16. Web client calls GET /v1/auth/session
    │
    ▼
17. Auth.js returns user data
    │
    ▼
18. AuthContext updates state
    │
    ▼
19. Web client clears query params and redirects to /
    │
    ▼
20. User logged in
```

### Credentials Login Flow - REST Pattern

```
1. User enters email/password and clicks "Sign in"
   │
   ▼
2. Web client POSTs to: /v1/auth/callback/credentials
   Body: email=...&password=... (form-encoded)
   │
   ▼
3. Auth.js validates credentials (calls authorize function)
   │
   ▼
4. Auth.js creates JWT session
   │
   ▼
5. Auth.js sets httpOnly cookie
   │
   ▼
6. Auth.js returns user data
   │
   ▼
7. AuthContext updates state
   │
   ▼
8. User logged in (no redirect needed)
```

## Technical Implementation Notes

### Form-Encoded POST Requirement

Auth.js credential and email sign-in endpoints expect `application/x-www-form-urlencoded`, not JSON. The web client must use a form-encoded POST helper:

```typescript
// ❌ Wrong - Auth.js will reject JSON
fetch('/v1/auth/callback/credentials', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

// ✅ Correct - Auth.js expects form-encoded
fetch('/v1/auth/callback/credentials', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email, password }).toString(),
});
```

**Alternative**: Create a thin API shim that accepts JSON and forwards as form data to Auth.js. This keeps the web client API consistent but adds an extra hop.

### OAuth Callback Handling

After OAuth redirect, the web client must:

1. **Detect callback**: Check for `?callbackUrl=...` or `?error=...` query params
2. **Handle errors**: Extract error from URL and show to user
3. **Poll session**: Call `GET /v1/auth/session` to get user data (cookie is already set by Auth.js)
4. **Clear params**: Remove query params from URL to avoid re-triggering callback handler
5. **Redirect**: Navigate to `callbackUrl` destination

**Example callback URL**: `http://localhost:5173/?callbackUrl=/&error=OAuthAccountNotLinked`

### CORS Configuration

OAuth redirects require CORS to allow:
- Web client origin (`http://localhost:5173`)
- API origin (`http://localhost:3000`) for OAuth callbacks
- `credentials: true` for httpOnly cookies

Without proper CORS, OAuth callbacks will fail with CORS errors.

### Session Polling vs. Server-Sent Events

The REST pattern requires polling `/v1/auth/session` after OAuth callback. This is simple but adds a round-trip. Alternatives:

- **Server-sent events**: Auth.js could push session data to client
- **WebSocket**: Real-time session updates
- **Redirect with token**: Auth.js could include session token in redirect URL (less secure)

For v1, polling is sufficient. Future optimization if needed.

### Why No @auth/react?

`@auth/react` is designed for Next.js with server-side rendering. Using it in a Vite SPA:

- ❌ Breaks API-first architecture (client becomes Auth.js-aware)
- ❌ Doesn't work with Capacitor (expects browser environment)
- ❌ Adds unnecessary dependency
- ❌ Couples client to Auth.js implementation details
- ❌ Makes testing harder (must mock Auth.js internals)

The REST pattern keeps the web client as a dumb API consumer, making it portable and testable.

---

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
5. Verify session format compatibility (see `docs/authjs-session-payload.md` for the current golden payload)

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
3. Run all 225 existing tests (includes Phase 3 PAT tests)
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
- All 225 existing tests pass (includes Phase 3 PAT tests)
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
   - **Recommendation**: Defer for now; current provider configuration allows Apple (and others) to be added later without redesign once the account is available

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
