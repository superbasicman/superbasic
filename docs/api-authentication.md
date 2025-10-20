# API Authentication Guide

SuperBasic Finance provides two authentication methods for accessing the API: session-based authentication (for web clients) and Bearer token authentication (for programmatic access).

## Table of Contents

- [Authentication Methods](#authentication-methods)
  - [Session Authentication](#session-authentication)
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

Session authentication uses JWT tokens stored in httpOnly cookies. This method is used by the web client and provides full access to all API endpoints without scope restrictions.

**How it works:**

1. User logs in via `POST /v1/login` with email and password
2. Server validates credentials and creates a JWT session
3. Session token is stored in an httpOnly cookie (`__Host-sbfin_auth` in production, `__sbfin_auth` in development)
4. Cookie is automatically sent with subsequent requests
5. Server validates JWT and attaches user context to the request

**Cookie attributes:**

- `httpOnly: true` - Prevents JavaScript access
- `secure: true` - HTTPS only (production)
- `sameSite: 'lax'` - CSRF protection
- `maxAge: 30 days` - Session expiration

**Example login request:**

```bash
curl -X POST https://api.superbasic.finance/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

**Response:**

```json
{
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

The session cookie is set automatically in the response headers.

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
  -H "Cookie: __Host-sbfin_auth=<session_token>" \
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
  -H "Cookie: __Host-sbfin_auth=<session_token>"
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
  -H "Cookie: __Host-sbfin_auth=<session_token>"
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
  -H "Cookie: __Host-sbfin_auth=<session_token>" \
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

<!-- TODO: Phase 6 - Document workspace scopes when workspace multi-tenancy is implemented -->
**Future scopes (Phase 6+):**

- `read:workspaces` - View workspace information
- `write:workspaces` - Manage workspace settings and members
- `admin` - Full access to all resources (internal use only)

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
  -H "Cookie: __Host-sbfin_auth=<session_token>"
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
  -H "Cookie: __Host-sbfin_auth=<session_token>"
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

- [Project Plan](project_plan.md) - Complete roadmap and phase breakdown
- [Phase 3 Spec](.kiro/specs/api-key-management/) - Detailed API key management specification
- [Database Schema](.kiro/steering/database-schema.md) - Complete database schema reference

---

**Last Updated:** 2025-01-20  
**API Version:** v1  
**Phase:** 3 - API Key Management
