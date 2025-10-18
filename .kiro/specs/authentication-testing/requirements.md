# Requirements Document

## Introduction

This specification defines the testing requirements for the authentication system implemented in Phase 2. The goal is to ensure the authentication endpoints (register, login, logout, session management) are thoroughly tested with both integration tests and end-to-end tests before moving to Phase 3 (API Key Management).

## Glossary

- **API**: The Hono-based backend server exposing /v1 routes
- **Integration Test**: Server-side test that exercises API endpoints with a real test database
- **E2E Test**: End-to-end test using Playwright that simulates user interactions in a browser
- **Test Database**: Isolated Postgres database instance used exclusively for testing
- **Session Cookie**: httpOnly cookie containing JWT token for authenticated sessions
- **Rate Limiter**: Upstash Redis-based rate limiting middleware

## Requirements

### Requirement 1: Integration Test Infrastructure

**User Story:** As a developer, I want integration tests for authentication endpoints, so that I can verify API behavior with a real database

#### Acceptance Criteria

1. WHEN the test suite initializes, THE Test Infrastructure SHALL create an isolated test database instance
2. WHEN each test begins, THE Test Infrastructure SHALL reset the test database to a clean state
3. WHEN the test suite completes, THE Test Infrastructure SHALL clean up test database connections
4. THE Test Infrastructure SHALL provide utilities for making authenticated HTTP requests to API endpoints
5. THE Test Infrastructure SHALL mock or disable rate limiting during tests to prevent test failures

### Requirement 2: User Registration Tests

**User Story:** As a developer, I want tests for user registration, so that I can verify users can create accounts correctly

#### Acceptance Criteria

1. WHEN a valid registration request is submitted, THE API SHALL return status 201 with user data
2. WHEN a registration request contains an existing email, THE API SHALL return status 409 with an error message
3. WHEN a registration request contains invalid data, THE API SHALL return status 400 with validation errors
4. WHEN a user registers successfully, THE API SHALL store the hashed password in the database
5. WHEN a user registers successfully, THE API SHALL emit a user.registered audit event

### Requirement 3: User Login Tests

**User Story:** As a developer, I want tests for user login, so that I can verify authentication works correctly

#### Acceptance Criteria

1. WHEN valid credentials are provided, THE API SHALL return status 200 with user data and set a session cookie
2. WHEN invalid credentials are provided, THE API SHALL return status 401 with an error message
3. WHEN a non-existent email is provided, THE API SHALL return status 401 with an error message
4. WHEN login succeeds, THE API SHALL emit a user.login.success audit event
5. WHEN login fails, THE API SHALL emit a user.login.failed audit event with failure reason

### Requirement 4: Session Management Tests

**User Story:** As a developer, I want tests for session validation, so that I can verify protected routes are secure

#### Acceptance Criteria

1. WHEN a valid session cookie is provided, THE API SHALL return status 200 with user profile data from GET /v1/me
2. WHEN no session cookie is provided, THE API SHALL return status 401 from GET /v1/me
3. WHEN an invalid session cookie is provided, THE API SHALL return status 401 from GET /v1/me
4. WHEN an expired session cookie is provided, THE API SHALL return status 401 from GET /v1/me
5. THE API SHALL attach userId, userEmail, and jti to the request context for authenticated requests

### Requirement 5: User Logout Tests

**User Story:** As a developer, I want tests for user logout, so that I can verify sessions are properly terminated

#### Acceptance Criteria

1. WHEN a logout request is made, THE API SHALL return status 204 with no content
2. WHEN a logout request is made, THE API SHALL delete the session cookie
3. WHEN a logout request is made, THE API SHALL emit a user.logout audit event
4. WHEN a user logs out, THE API SHALL reject subsequent requests with the old session cookie

### Requirement 6: E2E Authentication Flow Tests

**User Story:** As a developer, I want end-to-end tests for the complete authentication flow, so that I can verify the web client works correctly

#### Acceptance Criteria

1. WHEN a user navigates to the registration page, THE Web Client SHALL display a registration form
2. WHEN a user submits valid registration data, THE Web Client SHALL redirect to the login page
3. WHEN a user submits valid login credentials, THE Web Client SHALL redirect to the dashboard
4. WHEN a user is authenticated, THE Web Client SHALL display user information on the dashboard
5. WHEN a user clicks logout, THE Web Client SHALL clear the session and redirect to the login page
6. WHEN a user refreshes the page while authenticated, THE Web Client SHALL maintain the session
7. WHEN a user attempts to access a protected route without authentication, THE Web Client SHALL redirect to the login page

### Requirement 7: Rate Limiting Tests

**User Story:** As a developer, I want tests for rate limiting behavior, so that I can verify brute force protection works

#### Acceptance Criteria

1. WHEN rate limiting is enabled, THE API SHALL reject requests exceeding 10 per minute with status 429
2. WHEN rate limiting is enabled, THE API SHALL include X-RateLimit-Limit and X-RateLimit-Remaining headers
3. WHEN Redis is unavailable, THE API SHALL gracefully fail open and allow requests
4. THE Test Infrastructure SHALL provide a way to test rate limiting behavior without waiting for time windows

### Requirement 8: Test Documentation

**User Story:** As a developer, I want clear documentation for running tests, so that I can execute tests locally and in CI

#### Acceptance Criteria

1. THE Documentation SHALL include instructions for setting up the test database
2. THE Documentation SHALL include commands for running integration tests
3. THE Documentation SHALL include commands for running E2E tests
4. THE Documentation SHALL include instructions for running tests in watch mode during development
5. THE Documentation SHALL include troubleshooting guidance for common test failures
