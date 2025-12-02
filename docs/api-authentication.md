# API Authentication Guide

> **Note:** Auth.js is identity-only. `/v1/auth/login` is removed, `/v1/auth/csrf` is not used, and Auth.js session/CSRF cookies are stripped. Provider callbacks mint auth-core refresh cookies (`sb.refresh-token` + `sb.refresh-csrf`) and return an access token header for bootstrap. Refresh uses double-submit CSRF on `sb.refresh-csrf`.

SuperBasic Finance provides multiple authentication methods for accessing the API: Auth.js provider flows that issue auth-core refresh/access tokens for web clients, and Bearer token authentication (PATs) for programmatic access.

## Table of Contents

- [Authentication Methods](#authentication-methods)
  - [Session Authentication](#session-authentication)
    - [Credentials (Email/Password)](#credentials-emailpassword)
    - [OAuth (Google)](#oauth-google)
    - [Magic Link (Email)](#magic-link-email)
  - [Bearer Token Authentication](#bearer-token-authentication)
- [Token Management Endpoints](#token-management-endpoints)
  - [Create API Key](#create-api-key)
  - [List API Keys](#list-api-keys)
  - [Revoke API Key](#revoke-api-key)
  - [Update API Key Name](#update-api-key-name)
- [Scope System](#scope-system)
  - [Available Scopes](#available-scopes)
  - [Scope Enforcement](#scope-enforcement)
- [Error Responses](#error-responses)
- [Security Best Practices](#security-best-practices)
- [Rate Limiting](#rate-limiting)

---

## Authentication Methods

### Session Authentication

Session authentication uses auth-core refresh cookies issued by Auth.js provider callbacks. Auth.js cookies are stripped; only auth-core cookies are sent:

- `sb.refresh-token` (httpOnly) + `sb.refresh-csrf` (readable) set on callback.
- `X-Access-Token` header is returned on callback for bootstrap.
- Clients call `POST /v1/auth/refresh` with double-submit CSRF (`X-CSRF-Token: <sb.refresh-csrf>`), receive `{ accessToken, expiresIn }`, and use Bearer tokens for API calls.

Supported identity flows:

1. **Credentials** - Traditional email/password login (Auth.js credentials callback)
2. **OAuth** - Sign in with Google
3. **Magic Link** - Passwordless email authentication

---

#### Credentials (Email/Password)

**Endpoint:** `POST /v1/auth/callback/authjs:credentials` (form-encoded)

**How it works:**

1. POST email/password to `/v1/auth/callback/authjs:credentials` (no Auth.js CSRF needed).
2. Callback sets `sb.refresh-token` + `sb.refresh-csrf` cookies and returns `X-Access-Token`/`X-Access-Token-Expires-In` headers.
3. Optionally call `POST /v1/auth/refresh` with `X-CSRF-Token: <sb.refresh-csrf>` to obtain `{ accessToken, expiresIn }` for API calls.

**Example request:**

```bash
# Sign in with credentials (stores refresh/CSRF cookies)
curl -i -c /tmp/cookies.txt -X POST http://localhost:3000/v1/auth/callback/authjs:credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=user@example.com" \
  --data-urlencode "password=SecurePassword123!"

# Exchange refresh cookie for access token
CSRF=$(awk '($0 !~ /^#/ && $6=="sb.refresh-csrf"){print $7}' /tmp/cookies.txt | tail -n1)
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{}' 
```

---

#### OAuth (Google)

Sign in with Google account using OAuth 2.0 + OpenID Connect.

**Endpoint:** `GET /v1/auth/signin/google`

**How it works:**

1. Client redirects user to `/v1/auth/signin/google?callbackUrl=<return_url>`
2. Server redirects to Google OAuth consent screen
3. User authorizes application on Google
4. Google redirects back to `/v1/auth/callback/google` with authorization code
5. Server exchanges code for access token and user profile
6. Server creates or links user account (by email)
7. Server sets `sb.refresh-token` + `sb.refresh-csrf` cookies and returns `X-Access-Token` header
8. Server redirects to `callbackUrl`

**Example flow:**

```bash
# Step 1: Initiate OAuth flow (in browser)
open "http://localhost:3000/v1/auth/signin/google?callbackUrl=http://localhost:5173/"

# User completes Google OAuth consent...

# Step 2: After redirect, refresh to get access token
CSRF=$(awk '($0 !~ /^#/ && $6=="sb.refresh-csrf"){print $7}' /tmp/cookies.txt | tail -n1)
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{}'
```

Use the refresh cookie + `sb.refresh-csrf` header to call `/v1/auth/refresh` and obtain an access token.

**Database Records:**

OAuth authentication creates records in two tables:
- `users` - User identity (shared across all auth methods)
- `accounts` - OAuth provider linkage (provider: 'google', providerAccountId: '<google_user_id>')

**Error Responses:**

OAuth errors are returned as query parameters in the callback URL:

- `?error=OAuthAccountNotLinked` - Email already in use with different provider
- `?error=OAuthCallback` - OAuth provider returned an error
- `?error=AccessDenied` - User denied authorization

**Setup Requirements:**

See [OAuth Setup Guide](oauth-setup-guide.md) for detailed instructions on:
- Creating Google OAuth app in Google Cloud Console
- Configuring redirect URIs
- Obtaining client ID and secret
- Setting environment variables

**Environment Variables:**

```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AUTH_URL=http://localhost:3000  # API base URL
AUTH_TRUST_HOST=true            # Required for development
```

---

#### Magic Link (Email)

Passwordless authentication via email link.

**Endpoint:** `POST /v1/auth/signin/authjs:email` (form-encoded)

**Rate Limiting:** 3 requests per hour per email address

**How it works:**

1. Client POSTs email to `/v1/auth/signin/authjs:email` (no Auth.js CSRF needed).
2. Server generates verification token and sends email via Resend.
3. User clicks link → `/v1/auth/callback/authjs:email` sets `sb.refresh-token` + `sb.refresh-csrf` and returns `X-Access-Token`.
4. Client calls `/v1/auth/refresh` with `X-CSRF-Token: <sb.refresh-csrf>` to obtain an access token, then uses Bearer tokens for API calls.

**Example request:**

```bash
# Step 1: Request magic link
curl -i -X POST http://localhost:3000/v1/auth/signin/authjs:email \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=user@example.com"

# Response: HTTP/1.1 302 Found
# Location: /v1/auth/verify-request?provider=authjs:email&type=email

# Step 2: Click magic link (from email)
curl -i "http://localhost:3000/v1/auth/callback/authjs:email?token=<token>&email=user@example.com"

# Response: HTTP/1.1 302 Found
# Set-Cookie: sb.refresh-token=...; HttpOnly; SameSite=Lax
# Set-Cookie: sb.refresh-csrf=...
# Location: http://localhost:5173/  # Callback URL

# Step 3: Exchange refresh cookie for access token
CSRF=$(awk '($0 !~ /^#/ && $6=="sb.refresh-csrf"){print $7}' /tmp/cookies.txt | tail -n1)
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{}'
```

**Email Template:**

The magic link email includes:
- Styled "Sign In" button (HTML version)
- Plain text link (for email clients without HTML support)
- 24-hour expiration notice
- Support contact information

**Rate Limiting:**

Magic link requests are rate limited to prevent abuse:
- **Limit:** 3 requests per hour per email address
- **Window:** Sliding 1-hour window
- **Scope:** Per email (normalized: lowercase + trimmed)
- **Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

**Rate limit exceeded response:**

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640000000
Retry-After: 3600

{
  "error": "Too many magic link requests",
  "message": "Rate limit exceeded. You can request another magic link in 60 minutes."
}
```

**Error Responses:**

- `400 Bad Request` - Invalid email format
- `403 Forbidden` - CSRF token invalid or missing
- `429 Too Many Requests` - Rate limit exceeded (3 per hour)
- `401 Unauthorized` - Invalid or expired token (when clicking link)

**Token Security:**

- Tokens are 256-bit cryptographically secure random values
- Tokens are hashed (SHA-256) before storage in database
- Tokens expire after 24 hours
- Tokens can only be used once
- Tokens are tied to specific email address

**Setup Requirements:**

Magic link authentication requires email service configuration:

**Environment Variables:**

```bash
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=noreply@superbasicfinance.com
```

**Email Service:** Resend (https://resend.com)
- Modern API with excellent deliverability
- Domain verification required for production
- Free tier: 100 emails/day, 3,000 emails/month

See Task 7 documentation for detailed Resend setup instructions.

### Bearer Token Authentication

Bearer token authentication uses Personal Access Tokens (PATs) for programmatic API access. This method is ideal for:

- CLI tools and scripts
- CI/CD pipelines
- Third-party integrations
- Mobile applications
- Automation workflows

**How it works:**

1. User creates an API key via the web interface or `POST /v1/tokens`
2. Server generates a cryptographically secure token with `sbf_` prefix
3. Token is shown once and must be saved by the user
4. Token is hashed with SHA-256 and stored in the database
5. For API requests, token is sent in the `Authorization` header
6. Server hashes the incoming token and looks up the hash in the database
7. Server validates the token (not expired, not revoked) and checks scopes
8. Server attaches user context and token scopes to the request

**Token format:**

```
sbf_<43 base64url characters>
```

Example: `sbf_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V`

**Security features:**

- 256 bits of entropy (cryptographically secure)
- SHA-256 one-way hashing (plaintext never stored)
- Constant-time comparison (prevents timing attacks)
- Token prefix enables secret scanning in code repositories
- Scope-based permissions (least privilege access)

**Example API request with Bearer token:**

```bash
curl https://api.superbasic.finance/v1/transactions \
  -H "Authorization: Bearer sbf_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V"
```

**Response:**

```json
{
  "transactions": [
    {
      "id": "txn_123",
      "amount": -4250,
      "currency": "USD",
      "merchant": "Whole Foods",
      "postedAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

## Token Management Endpoints

### Create API Key

Create a new Personal Access Token with specified scopes and expiration.

**Endpoint:** `POST /v1/tokens`

**Authentication:** Session authentication required (cannot create tokens with another token)

**Request body:**

```json
{
  "name": "CI/CD Pipeline",
  "scopes": ["read:transactions", "read:budgets"],
  "expiresInDays": 90
}
```

**Parameters:**

| Field         | Type     | Required | Description                                                                |
| ------------- | -------- | -------- | -------------------------------------------------------------------------- |
| name          | string   | Yes      | Descriptive name for the token (1-100 characters, must be unique per user) |
| scopes        | string[] | Yes      | Array of permission scopes (at least one required)                         |
| expiresInDays | number   | No       | Token expiration in days (1-365, default: 90)                              |

**Response:** `201 Created`

```json
{
  "token": "sbf_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V",
  "id": "tok_abc123",
  "name": "CI/CD Pipeline",
  "scopes": ["read:transactions", "read:budgets"],
  "createdAt": "2025-01-18T10:30:00.000Z",
  "lastUsedAt": null,
  "expiresAt": "2025-04-18T10:30:00.000Z",
  "maskedToken": "sbf_****U1V"
}
```

**Important:** The plaintext `token` field is only returned once during creation. Save it securely - you won't be able to retrieve it again.

**Error responses:**

- `400 Bad Request` - Invalid scopes or expiration period
- `401 Unauthorized` - Not authenticated
- `409 Conflict` - Token name already exists
- `429 Too Many Requests` - Rate limit exceeded (10 tokens per hour)

**Example:**

```bash
curl -X POST https://api.superbasic.finance/v1/tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "name": "Mobile App",
    "scopes": ["read:transactions", "read:accounts"],
    "expiresInDays": 180
  }'
```

### List API Keys

Retrieve all active API keys for the authenticated user.

**Endpoint:** `GET /v1/tokens`

**Authentication:** Session authentication required

**Response:** `200 OK`

```json
{
  "tokens": [
    {
      "id": "tok_abc123",
      "name": "CI/CD Pipeline",
      "scopes": ["read:transactions", "read:budgets"],
      "createdAt": "2025-01-18T10:30:00.000Z",
      "lastUsedAt": "2025-01-20T14:22:00.000Z",
      "expiresAt": "2025-04-18T10:30:00.000Z",
      "maskedToken": "sbf_****U1V"
    },
    {
      "id": "tok_def456",
      "name": "Mobile App",
      "scopes": ["read:transactions", "read:accounts"],
      "createdAt": "2025-01-15T08:00:00.000Z",
      "lastUsedAt": null,
      "expiresAt": "2025-07-14T08:00:00.000Z",
      "maskedToken": "sbf_****X9Z"
    }
  ]
}
```

**Response fields:**

| Field       | Type     | Description                                                        |
| ----------- | -------- | ------------------------------------------------------------------ |
| id          | string   | Unique token identifier                                            |
| name        | string   | User-provided token name                                           |
| scopes      | string[] | Array of permission scopes                                         |
| createdAt   | string   | ISO 8601 timestamp of token creation                               |
| lastUsedAt  | string   | ISO 8601 timestamp of last authentication (null if never used)     |
| expiresAt   | string   | ISO 8601 timestamp of token expiration                             |
| maskedToken | string   | Masked token value showing last 4 characters (e.g., `sbf_****U1V`) |

**Notes:**

- Tokens are sorted by creation date (newest first)
- Revoked tokens are excluded from the list
- The `maskedToken` field shows the last 4 characters for identification purposes

**Example:**

```bash
curl https://api.superbasic.finance/v1/tokens \
  -H "Cookie: authjs.session-token=<session_token>"
```

### Revoke API Key

Revoke an API key immediately. Revoked tokens cannot be used for authentication.

**Endpoint:** `DELETE /v1/tokens/:id`

**Authentication:** Session authentication required

**Parameters:**

| Field | Type   | Required | Description            |
| ----- | ------ | -------- | ---------------------- |
| id    | string | Yes      | Token ID (in URL path) |

**Response:** `204 No Content`

No response body is returned on successful revocation.

**Error responses:**

- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Token not found or doesn't belong to the authenticated user

**Notes:**

- Revocation is immediate - the token cannot be used after this call
- Revocation is idempotent - calling DELETE twice returns 204 both times
- Revoked tokens are soft-deleted (preserved for audit trail)
- Any API requests with the revoked token will receive a 401 error

**Example:**

```bash
curl -X DELETE https://api.superbasic.finance/v1/tokens/tok_abc123 \
  -H "Cookie: authjs.session-token=<session_token>"
```

### Update API Key Name

Update the name of an existing API key without regenerating the token.

**Endpoint:** `PATCH /v1/tokens/:id`

**Authentication:** Session authentication required

**Parameters:**

| Field | Type   | Required | Description            |
| ----- | ------ | -------- | ---------------------- |
| id    | string | Yes      | Token ID (in URL path) |

**Request body:**

```json
{
  "name": "Updated Token Name"
}
```

**Response:** `200 OK`

```json
{
  "id": "tok_abc123",
  "name": "Updated Token Name",
  "scopes": ["read:transactions", "read:budgets"],
  "createdAt": "2025-01-18T10:30:00.000Z",
  "lastUsedAt": "2025-01-20T14:22:00.000Z",
  "expiresAt": "2025-04-18T10:30:00.000Z",
  "maskedToken": "sbf_****U1V"
}
```

**Error responses:**

- `400 Bad Request` - Invalid name (empty or too long)
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Token not found or doesn't belong to the authenticated user
- `409 Conflict` - New name already exists for another token

**Notes:**

- Only the name is updated - the token value remains the same
- The token continues to work with the same scopes and expiration
- Name must be unique per user

**Example:**

```bash
curl -X PATCH https://api.superbasic.finance/v1/tokens/tok_abc123 \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<session_token>" \
  -d '{
    "name": "Production API Key"
  }'
```

---

## Scope System

The scope system implements least-privilege access control for API keys. Each token is granted specific permissions that determine which operations it can perform.

### Available Scopes

| Scope                | Description                                     |
| -------------------- | ----------------------------------------------- |
| `read:transactions`  | View transaction data                           |
| `write:transactions` | Modify transaction overlays (categories, notes) |
| `read:budgets`       | View budget data                                |
| `write:budgets`      | Create and modify budgets                       |
| `read:accounts`      | View connected account information              |
| `write:accounts`     | Connect and disconnect bank accounts            |
| `read:profile`       | View user profile information                   |
| `write:profile`      | Update user profile settings                    |

**Workspace scopes (Phase 6 PKCE/mobile):**

- `read:workspaces` - View workspace information
- `write:workspaces` - Manage workspace settings and members
- `admin` - Full access to all resources (internal use only)

### Mobile OAuth/PKCE

Native clients authenticate via OAuth 2.1 Authorization Code + PKCE:

1) `/v1/oauth/authorize` (system browser):
   - `response_type=code`
   - `client_id=mobile`
   - `redirect_uri=sb://callback` (must be allowlisted)
   - `code_challenge`, `code_challenge_method` (PKCE required)
   - optional `scope`, `state`
   - Redirects to `redirect_uri?code=...&state=...` with a short-lived, single-use code.

2) `/v1/oauth/token` (app):
   - `grant_type=authorization_code`
   - `code`
   - `redirect_uri`
   - `client_id`
   - `code_verifier` (must match challenge)

On success, returns `accessToken` + `refreshToken` and creates a `mobile` session. Codes are single-use and PKCE-validated server-side.

### Scope Enforcement

**Session authentication:**

- Session-authenticated requests have full access to all endpoints
- No scope checks are performed for session auth
- This provides a seamless experience for web client users

**Bearer token authentication:**

- Each endpoint requires specific scopes
- Tokens must have the required scope to access the endpoint
- Missing scopes result in a 403 Forbidden error

**Endpoint scope requirements:**

| Endpoint                | Method | Required Scope       |
| ----------------------- | ------ | -------------------- |
| `/v1/transactions`      | GET    | `read:transactions`  |
| `/v1/transactions`      | POST   | `write:transactions` |
| `/v1/transactions/:id`  | GET    | `read:transactions`  |
| `/v1/transactions/:id`  | PATCH  | `write:transactions` |
| `/v1/transactions/:id`  | DELETE | `write:transactions` |
| `/v1/budgets`           | GET    | `read:budgets`       |
| `/v1/budgets`           | POST   | `write:budgets`      |
| `/v1/budgets/:id`       | GET    | `read:budgets`       |
| `/v1/budgets/:id`       | PATCH  | `write:budgets`      |
| `/v1/budgets/:id`       | DELETE | `write:budgets`      |
| `/v1/accounts`          | GET    | `read:accounts`      |
| `/v1/accounts/:id/sync` | POST   | `write:accounts`     |
| `/v1/me`                | GET    | `read:profile`       |
| `/v1/me`                | PATCH  | `write:profile`      |

**Example scope error:**

Request with insufficient scope:

```bash
curl https://api.superbasic.finance/v1/transactions \
  -X POST \
  -H "Authorization: Bearer sbf_<token_with_only_read_scope>" \
  -H "Content-Type: application/json" \
  -d '{"amount": -1000, "merchant": "Coffee Shop"}'
```

Response: `403 Forbidden`

```json
{
  "error": "Insufficient permissions",
  "required": "write:transactions"
}
```

---

## Error Responses

All error responses follow a consistent format with an `error` field containing a human-readable message.

### 400 Bad Request

Invalid request parameters or validation errors.

```json
{
  "error": "Invalid scopes provided"
}
```

**Common causes:**

- Invalid scope names
- Expiration period outside 1-365 days range
- Token name too long (>100 characters)
- Empty required fields

### 401 Unauthorized

Authentication failures.

```json
{
  "error": "Invalid token"
}
```

**Common causes:**

- Missing `Authorization` header
- Invalid token format (not `sbf_` prefix or wrong length)
- Token not found in database
- Token has been revoked
- Token has expired

**Specific error messages:**

```json
{ "error": "Invalid token" }          // Token not found or invalid format
{ "error": "Token expired" }          // Token past expiration date
{ "error": "Token revoked" }          // Token has been revoked
{ "error": "Missing or invalid Authorization header" }
```

### 403 Forbidden

Insufficient permissions for the requested operation.

```json
{
  "error": "Insufficient permissions",
  "required": "write:transactions"
}
```

**Common causes:**

- Token lacks required scope for the endpoint
- Attempting to access another user's resources

### 404 Not Found

Resource not found or not accessible by the authenticated user.

```json
{
  "error": "Token not found"
}
```

**Common causes:**

- Token ID doesn't exist
- Token belongs to a different user
- Resource has been deleted

**Note:** For security reasons, the API returns 404 instead of 403 when a token belongs to another user. This prevents user enumeration.

### 409 Conflict

Resource conflict, typically duplicate names.

```json
{
  "error": "Token name already exists"
}
```

**Common causes:**

- Creating a token with a name that already exists for the user
- Updating a token name to match another existing token

### 429 Too Many Requests

Rate limit exceeded.

```json
{
  "error": "Too many tokens created. Please try again later."
}
```

**Rate limits:**

- Token creation: 10 tokens per hour per user
- Failed authentication: 100 attempts per hour per IP address
- Successful authentication: No limit

**Response headers:**

```
Retry-After: 3600
```

The `Retry-After` header indicates how many seconds to wait before retrying.

---

## Security Best Practices

### Token Storage

**DO:**

- ✅ Store tokens in environment variables
- ✅ Use secret management services (AWS Secrets Manager, HashiCorp Vault, etc.)
- ✅ Encrypt tokens at rest in your application's configuration
- ✅ Use different tokens for different environments (dev, staging, prod)

**DON'T:**

- ❌ Commit tokens to version control (Git, SVN, etc.)
- ❌ Store tokens in plaintext configuration files
- ❌ Share tokens via email, Slack, or other messaging platforms
- ❌ Log tokens in application logs or error messages
- ❌ Expose tokens in client-side code or browser storage

**Example environment variable:**

```bash
# .env file (add to .gitignore)
SUPERBASIC_API_TOKEN=sbf_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V
```

**Example usage in code:**

```javascript
const apiToken = process.env.SUPERBASIC_API_TOKEN;

fetch("https://api.superbasic.finance/v1/transactions", {
  headers: {
    Authorization: `Bearer ${apiToken}`,
  },
});
```

### Token Rotation

Regularly rotate tokens to minimize the impact of potential compromises.

**Recommended rotation schedule:**

- **Production tokens:** Every 90 days
- **Development tokens:** Every 180 days
- **CI/CD tokens:** Every 90 days
- **Immediately:** If you suspect a token has been compromised

**Rotation process:**

1. Create a new token with the same scopes
2. Update your application to use the new token
3. Test that the new token works correctly
4. Revoke the old token
5. Monitor for any errors or failed requests

**Example rotation script:**

```bash
#!/bin/bash

# 1. Create new token (via web UI or API)
NEW_TOKEN="sbf_<new_token_value>"

# 2. Update environment variable
echo "SUPERBASIC_API_TOKEN=$NEW_TOKEN" > .env.production

# 3. Deploy updated configuration
./deploy.sh

# 4. Wait for deployment to complete
sleep 60

# 5. Revoke old token (via web UI or API)
curl -X DELETE https://api.superbasic.finance/v1/tokens/tok_old123 \
  -H "Cookie: authjs.session-token=<session_token>"
```

### Least Privilege Scope Selection

Only grant the minimum scopes required for your use case.

**Examples:**

**Read-only analytics dashboard:**

```json
{
  "name": "Analytics Dashboard",
  "scopes": ["read:transactions", "read:budgets"]
}
```

**Transaction import script:**

```json
{
  "name": "Transaction Importer",
  "scopes": ["write:transactions"]
}
```

**Full-featured mobile app:**

```json
{
  "name": "Mobile App",
  "scopes": [
    "read:transactions",
    "write:transactions",
    "read:budgets",
    "write:budgets",
    "read:accounts",
    "read:profile"
  ]
}
```

**CI/CD pipeline (read-only tests):**

```json
{
  "name": "CI/CD Tests",
  "scopes": ["read:transactions", "read:budgets", "read:accounts"]
}
```

### Expiration Policy Recommendations

Set appropriate expiration periods based on token usage:

**Short-lived tokens (30-90 days):**

- Temporary integrations
- Testing and development
- Third-party access
- Shared environments

**Medium-lived tokens (90-180 days):**

- Production applications
- CI/CD pipelines
- Internal tools
- Mobile applications

**Long-lived tokens (180-365 days):**

- Critical infrastructure
- Long-running background jobs
- Stable production services

**Never-expiring tokens:**

- Not recommended for security reasons
- If absolutely necessary, implement strict monitoring and rotation policies

### Monitoring and Auditing

**Track token usage:**

- Monitor the `lastUsedAt` field in the token list
- Set up alerts for tokens that haven't been used in 30+ days
- Review and revoke unused tokens regularly

**Audit token activity:**

- All token operations are logged with full context
- Review audit logs for suspicious activity
- Monitor for failed authentication attempts

**Security indicators:**

- ⚠️ Token never used after creation
- ⚠️ Token not used in 30+ days
- ⚠️ Multiple failed authentication attempts
<!-- TODO: Phase 13 - Document IP address tracking when security hardening is implemented -->
- ⚠️ Token used from unexpected IP addresses (future feature)

### Incident Response

**If a token is compromised:**

1. **Immediately revoke the token** via the web UI or API
2. **Create a new token** with the same scopes
3. **Update your application** to use the new token
4. **Review audit logs** to assess the impact
5. **Monitor for suspicious activity** in the following days
6. **Consider rotating all tokens** if the compromise is severe

**Example revocation:**

```bash
# Revoke compromised token immediately
curl -X DELETE https://api.superbasic.finance/v1/tokens/tok_compromised \
  -H "Cookie: authjs.session-token=<session_token>"
```

### Secret Scanning

The `sbf_` prefix enables automatic secret detection by security tools:

- **GitHub Secret Scanning:** Automatically detects tokens in public repositories
- **GitGuardian:** Monitors for exposed secrets in commits
- **TruffleHog:** Scans Git history for secrets
- **Pre-commit hooks:** Prevent accidental commits of tokens

**Example pre-commit hook:**

```bash
#!/bin/bash
# .git/hooks/pre-commit

if git diff --cached | grep -q "sbf_"; then
  echo "Error: SuperBasic Finance API token detected in commit"
  echo "Remove the token and use environment variables instead"
  exit 1
fi
```

---

## Rate Limiting

Rate limits protect the API from abuse and ensure fair usage for all users.

### Token Creation Limits

**Limit:** 10 tokens per hour per user

**Applies to:** `POST /v1/tokens`

**Response when exceeded:**

```
HTTP/1.1 429 Too Many Requests
Retry-After: 3600

{
  "error": "Too many tokens created. Please try again later."
}
```

**Best practices:**

- Create tokens in advance rather than on-demand
- Reuse existing tokens when possible
- Implement exponential backoff if you hit the limit

### Authentication Failure Limits

**Limit:** 100 failed attempts per hour per IP address

**Applies to:** Bearer token authentication failures

**Counted failures:**

- Invalid token format
- Token not found
- Expired tokens
- Revoked tokens

**Not counted:**

- Successful authentications
- Scope enforcement failures (403 errors)

**Response when exceeded:**

```
HTTP/1.1 429 Too Many Requests
Retry-After: 3600

{
  "error": "Too many failed authentication attempts. Please try again later."
}
```

**Best practices:**

- Validate token format before making requests
- Cache token validation results
- Implement exponential backoff for retries
- Monitor for authentication failures in your application

### Successful Request Limits

**Current:** No rate limits on successful authenticated requests

<!-- TODO: Phase 13 - Document per-token rate limits when tier-based rate limiting is implemented -->
**Future:** Per-token rate limits may be introduced based on subscription tier (Phase 13)

---

## Additional Resources

- [Project Plan](../.scope/project_plan.md) - Complete roadmap and phase breakdown
- [OAuth Setup Guide](oauth-setup-guide.md) - Step-by-step Google OAuth configuration
- [Deployment Guide](vercel-deployment-guide.md) - Production deployment walkthrough

---

## OAuth Setup Guide

### Google OAuth Configuration

To enable Google OAuth authentication, you need to create an OAuth app in Google Cloud Console.

**Step-by-step instructions:**

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing one
   - Note the project ID

2. **Enable Google+ API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials**
   - Navigate to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "SuperBasic Finance"

4. **Configure Authorized Redirect URIs**
   - Development: `http://localhost:3000/v1/auth/callback/google`
   - Production: `https://api.superbasicfinance.com/v1/auth/callback/google`

5. **Copy Credentials**
   - Copy "Client ID" and "Client secret"
   - Add to `.env.local`:
     ```bash
     GOOGLE_CLIENT_ID=your_client_id_here
     GOOGLE_CLIENT_SECRET=your_client_secret_here
     ```

6. **Configure Auth.js**
   - Credentials are automatically loaded from environment variables
   - Google provider is configured in `packages/auth/src/config.ts`

**Verification:**

```bash
# Check provider is available
curl http://localhost:3000/v1/auth/providers | jq

# Should include:
# {
#   "id": "google",
#   "name": "Google",
#   "type": "oidc",
#   "signinUrl": "http://localhost:3000/v1/auth/signin/google",
#   "callbackUrl": "http://localhost:3000/v1/auth/callback/google"
# }
```

**Future OAuth Providers:**

GitHub and Apple OAuth will be added in Phase 16 (Advanced Features). The setup process is similar:
- GitHub: Create OAuth app in GitHub Developer Settings
- Apple: Create Sign in with Apple identifier in Apple Developer Portal

---

## Magic Link Setup Guide

### Resend Email Service Configuration

Magic link authentication requires an email service to send verification emails. SuperBasic Finance uses Resend for its modern API and excellent deliverability.

**Step-by-step instructions:**

1. **Create Resend Account**
   - Go to [resend.com](https://resend.com)
   - Sign up for free account
   - Verify your email address

2. **Verify Domain**
   - Navigate to "Domains" in Resend dashboard
   - Click "Add Domain"
   - Enter your domain: `superbasicfinance.com`
   - Add DNS records to your domain:
     - 1 MX record (for receiving bounces)
     - 2 TXT records (SPF and DKIM for authentication)
   - Wait for verification (usually < 5 minutes)

3. **Create API Key**
   - Navigate to "API Keys" in Resend dashboard
   - Click "Create API Key"
   - Name: "SuperBasic Finance API"
   - Permissions: "Sending access" (recommended for security)
   - Copy the API key (starts with `re_`)

4. **Configure Environment Variables**
   - Add to `.env.local`:
     ```bash
     RESEND_API_KEY=re_your_api_key_here
     EMAIL_FROM=noreply@superbasicfinance.com
     ```

5. **Test Email Sending**
   - Run test script:
     ```bash
     export $(cat apps/api/.env.local | xargs)
     pnpm tsx tooling/scripts/test-resend.ts your-email@example.com
     ```
   - Check inbox for test email

**Email Template Customization:**

The magic link email template is defined in `packages/auth/src/email.ts`. It includes:
- HTML version with styled button
- Plain text version for compatibility
- 24-hour expiration notice
- Support contact information

To customize the template, edit the `sendMagicLinkEmail()` function.

**Rate Limiting:**

Magic link requests are automatically rate limited:
- 3 requests per hour per email address
- Sliding window algorithm using Upstash Redis
- Clear error messages with retry time

**Troubleshooting:**

- **Emails not arriving:** Check domain verification status in Resend dashboard
- **Rate limit errors:** Wait 1 hour or use clear script: `pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts <email>`
- **CSRF errors:** Ensure CSRF token is fetched and included in request
- **Token expired:** Magic links expire after 24 hours - request a new one

---

## Troubleshooting

### Common Authentication Issues

**Refresh Cookie Not Set:**

- **Symptom:** Login succeeds but `/v1/auth/refresh` returns 401
- **Cause:** Cookie domain mismatch or SameSite restrictions
- **Solution:** Ensure API and web client are on same domain, HTTPS in production, and CORS allows credentials.

**OAuth Redirect Loop:**

- **Symptom:** Infinite redirects between app and OAuth provider
- **Cause:** Misconfigured redirect URI or callback URL
- **Solution:** Verify redirect URI in OAuth provider settings matches Auth.js callback URL exactly

**Magic Link Not Working:**

- **Symptom:** Clicking magic link shows error
- **Cause:** Token expired, already used, or invalid
- **Solution:** Request a new magic link (tokens expire after 24 hours and can only be used once)

**Rate Limit Exceeded:**

- **Symptom:** `429 Too Many Requests` when requesting magic link
- **Cause:** More than 3 requests in 1 hour for same email
- **Solution:** Wait for rate limit to reset (check `Retry-After` header) or contact support

**Account Linking Issues:**

- **Symptom:** OAuth error "OAuthAccountNotLinked"
- **Cause:** Email already registered with different authentication method
- **Solution:** Sign in with original method first, then link OAuth account in settings (Phase 16 feature)

### Debug Mode

Enable Auth.js debug logging for troubleshooting:

```bash
# Add to .env.local
AUTH_DEBUG=true
```

This will log detailed authentication flow information to the console.

---

## Architecture Notes

### REST-First Design

SuperBasic Finance uses a REST-first architecture for authentication:

- **No `@auth/react` dependency** - Web client remains a thin REST consumer
- **Auth.js lives entirely in API tier** - All authentication logic server-side
- **Standard HTTP endpoints** - Compatible with any client (web, mobile, CLI)
- **Capacitor-ready** - Architecture supports wrapping for iOS/Android apps

This design ensures:
- Clear separation of concerns
- Easy testing and debugging
- Platform independence
- Future-proof for mobile apps

### Session vs Token Authentication

**When to use session authentication:**
- Web client user interactions
- OAuth flows
- Magic link authentication
- Full access to all endpoints

**When to use Bearer token authentication:**
- CLI tools and scripts
- CI/CD pipelines
- Third-party integrations
- Mobile applications (with scope restrictions)
- Automation workflows

**Key differences:**
- Sessions have full access (no scope checks)
- Tokens are scope-restricted (least privilege)
- Sessions expire after 30 days of inactivity
- Tokens have configurable expiration (1-365 days)
- Sessions use httpOnly cookies (CSRF protection)
- Tokens use Authorization header (no CSRF needed)

---

**Last Updated:** 2025-10-26  
**API Version:** v1  
**Phase:** 2.1 - Auth.js Migration
