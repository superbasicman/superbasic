# Requirements Document

## Introduction

This document defines the requirements for Personal Access Token (PAT) management in SuperBasic Finance. The API Key Management feature enables users to generate secure tokens for programmatic API access, supporting automation, integrations, and third-party tool development. The system implements industry-standard security practices including secure token generation, one-way hashing, scope-based permissions, and comprehensive audit logging.

## Glossary

- **PAT (Personal Access Token)**: A secure, randomly-generated string that authenticates API requests on behalf of a user
- **Token Hash**: A SHA-256 digest of the plaintext token, stored in the database for verification
- **Scope**: A permission string that defines what operations a token can perform (e.g., `read:transactions`, `write:budgets`)
- **Bearer Token**: An authentication scheme where the token is included in the `Authorization: Bearer <token>` HTTP header
- **Token Lifecycle**: The stages of a token's existence: creation, usage, expiration, and revocation
- **API Key**: Synonym for PAT in user-facing contexts
- **Authentication System**: The existing Auth.js-based session management system from Phase 2
- **Audit Logger**: The structured logging system that records security-relevant events

## Requirements

### Requirement 1: Secure Token Generation

**User Story:** As a developer, I want to generate API keys with cryptographically secure random values, so that my tokens cannot be guessed or brute-forced by attackers.

#### Acceptance Criteria

1. WHEN a user requests token creation, THE Authentication System SHALL generate a random token using a cryptographically secure random number generator with at least 256 bits of entropy
2. THE Authentication System SHALL format the token as a base64url-encoded string with a minimum length of 32 characters
3. THE Authentication System SHALL prefix the token with `sbf_` to enable token identification and secret scanning
4. THE Authentication System SHALL display the plaintext token to the user exactly once during the creation flow
5. AFTER displaying the plaintext token, THE Authentication System SHALL compute a SHA-256 hash of the token and store only the hash in the database

### Requirement 2: Token Storage and Verification

**User Story:** As a security engineer, I want tokens to be stored as one-way hashes, so that database compromise does not expose plaintext tokens.

#### Acceptance Criteria

1. THE Authentication System SHALL store token hashes in a dedicated `api_keys` table with columns for hash, user_id, name, scopes, created_at, last_used_at, and expires_at
2. WHEN verifying an incoming token, THE Authentication System SHALL compute the SHA-256 hash of the provided token and compare it to stored hashes using constant-time comparison
3. THE Authentication System SHALL NOT store plaintext tokens in any database, log file, or cache
4. THE Authentication System SHALL index the token hash column for efficient lookup during authentication
5. IF a token hash matches multiple records, THEN THE Authentication System SHALL reject the request with a 401 Unauthorized response

### Requirement 3: Token Creation API

**User Story:** As a developer, I want to create API keys through a REST endpoint, so that I can generate tokens programmatically or through the web interface.

#### Acceptance Criteria

1. THE Authentication System SHALL expose a POST /v1/tokens endpoint that requires valid session authentication
2. WHEN a user submits a token creation request, THE Authentication System SHALL validate the request body contains a name (string, 1-100 characters) and scopes (array of valid scope strings)
3. THE Authentication System SHALL create a new token record associated with the authenticated user's ID
4. THE Authentication System SHALL return a response containing the plaintext token, token ID, name, scopes, and creation timestamp
5. THE Audit Logger SHALL record token creation events with user ID, token ID, token name, scopes, IP address, and timestamp

### Requirement 4: Token Listing API

**User Story:** As a developer, I want to view all my API keys, so that I can manage and audit my programmatic access.

#### Acceptance Criteria

1. THE Authentication System SHALL expose a GET /v1/tokens endpoint that requires valid session authentication
2. WHEN a user requests their token list, THE Authentication System SHALL return all tokens associated with the authenticated user's ID
3. THE Authentication System SHALL return token metadata including ID, name, scopes, created_at, last_used_at, and expires_at
4. THE Authentication System SHALL mask token values in the response, showing only the last 4 characters (e.g., `sbf_****abcd`)
5. THE Authentication System SHALL sort tokens by creation date in descending order (newest first)

### Requirement 5: Token Revocation API

**User Story:** As a developer, I want to revoke API keys immediately, so that I can respond quickly to security incidents or rotate credentials.

#### Acceptance Criteria

1. THE Authentication System SHALL expose a DELETE /v1/tokens/:id endpoint that requires valid session authentication
2. WHEN a user requests token deletion, THE Authentication System SHALL verify the token belongs to the authenticated user
3. IF the token belongs to a different user, THEN THE Authentication System SHALL return a 404 Not Found response
4. THE Authentication System SHALL permanently delete the token record from the database
5. THE Audit Logger SHALL record token revocation events with user ID, token ID, token name, IP address, and timestamp

### Requirement 6: Bearer Token Authentication

**User Story:** As a developer, I want to authenticate API requests using Bearer tokens, so that I can access the API without session cookies.

#### Acceptance Criteria

1. THE Authentication System SHALL accept tokens in the `Authorization: Bearer <token>` HTTP header on all /v1 endpoints
2. WHEN a request includes a Bearer token, THE Authentication System SHALL extract the token, compute its SHA-256 hash, and query the database for a matching record
3. IF a matching token is found and not expired, THEN THE Authentication System SHALL authenticate the request with the token's associated user ID
4. IF no matching token is found or the token is expired, THEN THE Authentication System SHALL return a 401 Unauthorized response with error code `invalid_token`
5. THE Authentication System SHALL update the token's last_used_at timestamp on each successful authentication

### Requirement 7: Token Scope Enforcement

**User Story:** As a security engineer, I want to restrict token permissions using scopes, so that tokens have least-privilege access to only required operations.

#### Acceptance Criteria

1. THE Authentication System SHALL define a set of valid scopes including `read:transactions`, `write:transactions`, `read:budgets`, `write:budgets`, `read:accounts`, `write:accounts`, `read:profile`, and `write:profile`
2. WHEN a token is created, THE Authentication System SHALL validate that all requested scopes are in the valid scope set
3. WHEN a protected endpoint is accessed with a Bearer token, THE Authentication System SHALL verify the token has the required scope for that operation
4. IF the token lacks the required scope, THEN THE Authentication System SHALL return a 403 Forbidden response with error code `insufficient_scope`
5. THE Authentication System SHALL allow session-authenticated requests to bypass scope checks (full access)

### Requirement 8: Token Expiration

**User Story:** As a security engineer, I want tokens to expire after a configurable period, so that compromised tokens have limited lifetime.

#### Acceptance Criteria

1. WHEN a token is created, THE Authentication System SHALL set an expiration timestamp based on a configurable TTL (default 90 days)
2. WHEN verifying a token, THE Authentication System SHALL check if the current timestamp exceeds the expires_at value
3. IF the token is expired, THEN THE Authentication System SHALL return a 401 Unauthorized response with error code `token_expired`
4. THE Authentication System SHALL allow users to specify custom expiration periods during token creation (minimum 1 day, maximum 365 days)
5. THE Authentication System SHALL NOT automatically delete expired tokens, preserving them for audit purposes

### Requirement 9: Rate Limiting for Token Operations

**User Story:** As a security engineer, I want to rate limit token creation and authentication attempts, so that attackers cannot abuse the token system.

#### Acceptance Criteria

1. THE Authentication System SHALL apply a rate limit of 10 token creations per user per hour
2. THE Authentication System SHALL apply a rate limit of 100 failed authentication attempts per IP address per hour
3. IF a rate limit is exceeded, THEN THE Authentication System SHALL return a 429 Too Many Requests response with a Retry-After header
4. THE Authentication System SHALL use the existing Upstash Redis rate limiter from Phase 2
5. THE Authentication System SHALL NOT rate limit successful token authentications (only failed attempts)

### Requirement 10: Web UI for Token Management

**User Story:** As a user, I want to manage my API keys through the web interface, so that I can create, view, and revoke tokens without using the API directly.

#### Acceptance Criteria

1. THE Web Client SHALL provide a dedicated API Keys settings page accessible from the user menu
2. THE Web Client SHALL display a list of existing tokens with name, scopes, creation date, last used date, and masked token value
3. THE Web Client SHALL provide a "Create API Key" button that opens a modal form
4. WHEN a user creates a token, THE Web Client SHALL display the plaintext token in a modal with a copy button and a warning that it will not be shown again
5. THE Web Client SHALL provide a "Revoke" button for each token that prompts for confirmation before deletion

### Requirement 11: Token Usage Analytics

**User Story:** As a developer, I want to see when my API keys were last used, so that I can identify unused tokens and improve security hygiene.

#### Acceptance Criteria

1. THE Authentication System SHALL update the last_used_at timestamp on each successful token authentication
2. THE Authentication System SHALL include last_used_at in the token list response
3. THE Web Client SHALL display last used timestamps in human-readable format (e.g., "2 hours ago", "Never used")
4. THE Web Client SHALL highlight tokens that have not been used in 30+ days with a warning indicator
5. THE Web Client SHALL provide a "Delete Unused Tokens" bulk action for tokens unused in 90+ days

### Requirement 12: Token Naming and Organization

**User Story:** As a developer, I want to assign descriptive names to my API keys, so that I can identify their purpose and usage context.

#### Acceptance Criteria

1. WHEN creating a token, THE Authentication System SHALL require a name parameter (string, 1-100 characters)
2. THE Authentication System SHALL validate that token names are unique per user
3. IF a duplicate name is provided, THEN THE Authentication System SHALL return a 400 Bad Request response with error code `duplicate_token_name`
4. THE Web Client SHALL display token names prominently in the token list
5. THE Web Client SHALL allow users to edit token names without regenerating the token

### Requirement 13: Audit Logging for Token Events

**User Story:** As a security engineer, I want comprehensive audit logs for token operations, so that I can investigate security incidents and track API usage.

#### Acceptance Criteria

1. THE Audit Logger SHALL record token creation events with user ID, token ID, token name, scopes, IP address, user agent, and timestamp
2. THE Audit Logger SHALL record token authentication events with token ID, endpoint, HTTP method, response status, IP address, and timestamp
3. THE Audit Logger SHALL record token revocation events with user ID, token ID, token name, IP address, and timestamp
4. THE Audit Logger SHALL record failed authentication attempts with provided token prefix, IP address, and timestamp
5. THE Audit Logger SHALL record scope enforcement failures with token ID, required scope, endpoint, and timestamp

### Requirement 14: Token Security Best Practices

**User Story:** As a security engineer, I want the token system to follow industry best practices, so that the implementation is secure and maintainable.

#### Acceptance Criteria

1. THE Authentication System SHALL use constant-time comparison for token hash verification to prevent timing attacks
2. THE Authentication System SHALL implement token prefix scanning to enable secret detection in code repositories
3. THE Authentication System SHALL validate token format before database lookup to prevent injection attacks
4. THE Authentication System SHALL return generic error messages for authentication failures to prevent user enumeration
5. THE Authentication System SHALL document token security best practices in API documentation (secure storage, rotation, least privilege)
