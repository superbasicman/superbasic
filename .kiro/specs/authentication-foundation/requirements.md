# Requirements Document

## Introduction

This specification defines the authentication foundation for SuperBasic Finance, an API-first personal finance platform. The system SHALL provide secure user authentication using Auth.js with credentials-based login, JWT session management, and protected API routes. The web client SHALL offer a seamless login and registration experience while maintaining the thin-client architecture where all authentication logic resides in the API.

## Glossary

- **Auth System**: The authentication and authorization subsystem built with Auth.js
- **API Server**: The Hono-based backend server exposing /v1 routes
- **Web Client**: The React SPA that consumes the API
- **User**: An individual with an account in the system
- **Session**: A JWT-based authentication token representing an authenticated user
- **Protected Route**: An API endpoint that requires valid authentication
- **Credentials Provider**: Auth.js authentication method using email and password
- **Middleware**: Hono middleware that validates authentication before route execution

## Requirements

### Requirement 1: User Registration

**User Story:** As a new user, I want to create an account with my email and password, so that I can access the platform.

#### Acceptance Criteria

1. WHEN a user submits valid registration data, THE API Server SHALL create a new user account with a hashed password
2. THE API Server SHALL normalize email addresses to lowercase and trim whitespace before storage
3. WHEN a user attempts to register with an existing email, THE API Server SHALL return a 409 Conflict error indicating the email is already in use
4. WHEN a user submits invalid registration data, THE API Server SHALL return a 400 Bad Request with validation errors providing specific field-level feedback
5. THE API Server SHALL enforce password requirements of minimum 8 characters
6. THE API Server SHALL store passwords using bcrypt hashing with a minimum cost factor of 10

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my account.

#### Acceptance Criteria

1. THE API Server SHALL normalize email addresses to lowercase and trim whitespace before authentication
2. WHEN a user submits valid credentials, THE Auth System SHALL use Auth.js to create a JWT session token
3. WHEN a user submits invalid credentials, THE Auth System SHALL return a 401 Unauthorized error without revealing whether the email or password was incorrect
4. THE Auth System SHALL include user ID, email, jti, iat, and exp in the JWT payload
5. THE Auth System SHALL set the JWT expiration to 30 days from creation
6. WHEN a user successfully authenticates, THE API Server SHALL return the user profile data

### Requirement 3: Session Management

**User Story:** As an authenticated user, I want my session to persist across requests, so that I don't have to log in repeatedly.

#### Acceptance Criteria

1. THE Auth System SHALL use Auth.js to generate JWT tokens signed with a secret key
2. THE Auth System SHALL store the JWT token in an httpOnly cookie for web client sessions
3. THE Auth System SHALL use Auth.js to validate JWT signatures on every protected route request
4. WHEN a JWT token expires, THE API Server SHALL return a 401 Unauthorized error
5. THE Web Client SHALL automatically include the httpOnly cookie in all requests to the same origin

### Requirement 4: Protected API Routes

**User Story:** As a system administrator, I want API endpoints to be protected by authentication, so that only authorized users can access sensitive data.

#### Acceptance Criteria

1. THE Middleware SHALL first attempt to extract the JWT token from the httpOnly auth-token cookie
2. Reserved for Personal Access Tokens (Phase 2). Session authentication does not use Authorization: Bearer
3. WHEN a request lacks a valid JWT token from either source, THE Middleware SHALL return a 401 Unauthorized response
4. WHEN a JWT token is invalid or expired, THE Middleware SHALL return a 401 Unauthorized response
5. WHEN a JWT token is valid, THE Middleware SHALL attach the user context to the request object
6. THE API Server SHALL apply the authentication middleware to all /v1 routes except public endpoints

### Requirement 5: User Profile Access

**User Story:** As an authenticated user, I want to retrieve my profile information, so that I can verify my account details.

#### Acceptance Criteria

1. WHEN an authenticated user requests their profile, THE API Server SHALL return the user's ID, email, and creation timestamp
2. THE API Server SHALL NOT return password hashes or other sensitive authentication data
3. WHEN an unauthenticated user requests a profile, THE API Server SHALL return a 401 Unauthorized response

### Requirement 6: Login UI

**User Story:** As a user, I want a login form in the web client, so that I can authenticate through the browser.

#### Acceptance Criteria

1. THE Web Client SHALL display a login form with email and password fields
2. WHEN a user submits the login form, THE Web Client SHALL send credentials to the API Server login endpoint
3. WHEN login succeeds, THE session cookie SHALL be automatically stored by the browser and THE Web Client SHALL redirect to the dashboard
4. WHEN login fails, THE Web Client SHALL display the error message returned by the API Server
5. THE Web Client SHALL disable the submit button while the login request is in progress

### Requirement 7: Registration UI

**User Story:** As a new user, I want a registration form in the web client, so that I can create an account through the browser.

#### Acceptance Criteria

1. THE Web Client SHALL display a registration form with email, password, and password confirmation fields
2. WHEN a user submits the registration form, THE Web Client SHALL send the data to the API Server registration endpoint
3. WHEN registration succeeds, THE Web Client SHALL automatically log the user in and redirect to the dashboard
4. WHEN registration fails, THE Web Client SHALL display validation errors next to the relevant form fields
5. THE Web Client SHALL validate that password and password confirmation match before submission

### Requirement 8: Logout Functionality

**User Story:** As an authenticated user, I want to log out of my account, so that I can end my session securely.

#### Acceptance Criteria

1. WHEN a user initiates logout, THE Web Client SHALL call the API Server logout endpoint to clear the httpOnly session cookie
2. WHEN a user logs out, THE Web Client SHALL redirect to the login page
3. THE Web Client SHALL clear local authentication state after logout

### Requirement 9: Authentication State Management

**User Story:** As a user, I want the web client to remember my authentication state, so that I remain logged in across page refreshes.

#### Acceptance Criteria

1. THE Web Client SHALL check for authentication status by calling the session endpoint on application initialization
2. WHEN the session endpoint returns a valid user, THE Web Client SHALL set the authenticated state
3. WHEN the session endpoint returns 401 Unauthorized, THE Web Client SHALL redirect unauthenticated users to the login page
4. THE Web Client SHALL handle token expiration by redirecting to the login page with an appropriate message
5. THE httpOnly cookie SHALL persist across page refreshes until expiration or explicit logout

### Requirement 10: Security Best Practices

**User Story:** As a security-conscious platform, I want authentication to follow industry best practices, so that user accounts are protected.

#### Acceptance Criteria

1. THE API Server SHALL use bcrypt for password hashing with a cost factor of at least 10
2. THE Auth System SHALL use a cryptographically secure random string for the JWT secret
3. THE API Server SHALL implement rate limiting on authentication endpoints to prevent brute force attacks
4. THE API Server SHALL log all authentication attempts for security auditing
5. THE Web Client SHALL NOT store passwords in any form after submission
