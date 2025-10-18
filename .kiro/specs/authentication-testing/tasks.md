# Implementation Plan

- [x] 1. Set up integration test infrastructure

  - Create test database configuration and setup utilities
  - Create test helpers for HTTP requests and cookie handling
  - Configure Vitest for API integration tests
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 1.1 Create test database setup utilities

  - Write `apps/api/src/test/setup.ts` with database initialization and teardown functions
  - Implement database reset function using Prisma migrations
  - Configure global test setup and teardown hooks
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 1.2 Create HTTP test helpers

  - Write `apps/api/src/test/helpers.ts` with request utilities
  - Implement `makeRequest` and `makeAuthenticatedRequest` functions
  - Implement cookie extraction helper
  - Create test user factory functions
  - _Requirements: 1.4_

- [x] 1.3 Configure Vitest for API tests

  - Create `apps/api/vitest.config.ts` with test configuration
  - Add test script to `apps/api/package.json`
  - Create `.env.test` file with test environment variables
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 1.4 Create rate limiter mocks

  - Write `apps/api/src/test/mocks.ts` with rate limiter mocking utilities
  - Implement mock functions to disable rate limiting during tests
  - Implement functions to simulate rate limit scenarios
  - _Requirements: 1.5_

- [x] 2. Implement user registration integration tests

  - Write comprehensive tests for POST /v1/register endpoint
  - Verify successful registration, duplicate email handling, and validation
  - Test password hashing and audit event emission
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2.1 Write registration success tests

  - Create `apps/api/src/routes/v1/__tests__/register.test.ts`
  - Test successful registration with valid data returns 201
  - Verify user data is returned correctly
  - Verify password is hashed in database
  - _Requirements: 2.1, 2.4_

- [x] 2.2 Write registration validation tests

  - Test duplicate email returns 409 Conflict
  - Test invalid email format returns 400
  - Test missing required fields returns 400
  - Test weak password returns 400
  - _Requirements: 2.2, 2.3_

- [x] 2.3 Write registration audit event tests

  - Test user.registered event is emitted on successful registration
  - Verify event contains correct user ID and email
  - Verify event contains IP address when available
  - _Requirements: 2.5_

- [x] 3. Implement user login integration tests

  - Write comprehensive tests for POST /v1/login endpoint
  - Verify successful login, invalid credentials handling, and session creation
  - Test audit event emission for success and failure cases
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3.1 Write login success tests

  - Create `apps/api/src/routes/v1/__tests__/login.test.ts`
  - Test successful login with valid credentials returns 200
  - Verify session cookie is set with correct attributes
  - Verify user data is returned correctly
  - _Requirements: 3.1_

- [x] 3.2 Write login failure tests

  - Test invalid password returns 401
  - Test non-existent email returns 401
  - Verify error messages don't leak information
  - _Requirements: 3.2, 3.3_

- [x] 3.3 Write login audit event tests

  - Test user.login.success event is emitted on successful login
  - Test user.login.failed event is emitted on failed login
  - Verify events contain correct metadata (reason, IP address)
  - _Requirements: 3.4, 3.5_

- [x] 4. Implement session management integration tests

  - Write comprehensive tests for GET /v1/me endpoint
  - Verify session validation and user context attachment
  - Test authentication middleware behavior
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4.1 Write session validation tests

  - Create `apps/api/src/routes/v1/__tests__/me.test.ts`
  - Test valid session cookie returns 200 with user profile
  - Test missing session cookie returns 401
  - Test invalid session cookie returns 401
  - Test expired session cookie returns 401
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4.2 Write authentication middleware tests

  - Create `apps/api/src/middleware/__tests__/auth.test.ts`
  - Test JWT extraction and validation
  - Test user context attachment (userId, userEmail, jti)
  - Test invalid claims rejection (iss, aud)
  - _Requirements: 4.5_

- [x] 5. Implement user logout integration tests

  - Write comprehensive tests for POST /v1/logout endpoint
  - Verify cookie deletion and session invalidation
  - Test audit event emission
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5.1 Write logout tests

  - Create `apps/api/src/routes/v1/__tests__/logout.test.ts`
  - Test logout returns 204 No Content
  - Test session cookie is deleted
  - Test subsequent requests with old cookie fail
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 5.2 Write logout audit event tests

  - Test user.logout event is emitted on logout
  - Verify event contains IP address when available
  - _Requirements: 5.3_

- [x] 6. Implement rate limiting integration tests

  - Write comprehensive tests for rate limiting middleware
  - Verify request counting, limit enforcement, and graceful failure
  - Test rate limit headers in responses
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 6.1 Write rate limit enforcement tests

  - Create `apps/api/src/middleware/__tests__/rate-limit.test.ts`
  - Test requests are counted correctly
  - Test 429 response when limit exceeded
  - Test rate limit headers are included in responses
  - _Requirements: 7.1, 7.2_

- [x] 6.2 Write rate limit failure handling tests

  - Test graceful failure when Redis is unavailable
  - Verify requests are allowed when rate limiter fails
  - Test error logging for rate limiter failures
  - _Requirements: 7.3_

- [x] 6.3 Write rate limit reset tests

  - Test rate limit window resets correctly
  - Test per-IP rate limiting isolation
  - _Requirements: 7.4_

- [x] 7. Set up E2E test infrastructure

  - Configure Playwright for authentication flow testing
  - Update web server configuration for E2E tests
  - Create test utilities for common E2E operations
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 7.1 Update Playwright configuration

  - Update `apps/web/playwright.config.ts` to start both API and web servers
  - Configure test environment variables
  - Set up screenshot and trace capture on failure
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 7.2 Create E2E test helpers

  - Create `apps/web/e2e/helpers.ts` with common test utilities
  - Implement login helper function
  - Implement registration helper function
  - Implement logout helper function
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 8. Implement authentication E2E tests

  - Write comprehensive end-to-end tests for authentication flows
  - Test registration, login, session persistence, and logout
  - Verify protected route access control
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 8.1 Write registration E2E tests

  - Create `apps/web/e2e/auth.spec.ts`
  - Test user can navigate to registration page
  - Test user can submit registration form
  - Test successful registration redirects to login page
  - _Requirements: 6.1, 6.2_

- [x] 8.2 Write login E2E tests

  - Test user can navigate to login page
  - Test user can submit login form with valid credentials
  - Test successful login redirects to dashboard
  - Test user information is displayed on dashboard
  - _Requirements: 6.3, 6.4_

- [x] 8.3 Write session persistence E2E tests

  - Test session persists after page refresh
  - Test user remains authenticated after navigation
  - Test protected routes are accessible when authenticated
  - _Requirements: 6.6_

- [x] 8.4 Write logout E2E tests

  - Test user can click logout button
  - Test logout redirects to login page
  - Test session is cleared after logout
  - Test protected routes redirect to login after logout
  - _Requirements: 6.5, 6.7_

- [x] 8.5 Write complete authentication journey E2E test

  - Test full flow: register → login → dashboard → logout
  - Verify each step completes successfully
  - Verify data persists across steps
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 9. Add test documentation and CI integration

  - Update README with testing instructions
  - Add test scripts to package.json
  - Configure CI pipeline to run tests
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 9.1 Update documentation

  - Add testing section to main README.md
  - Document test database setup instructions
  - Document commands for running integration and E2E tests
  - Add troubleshooting guide for common test failures
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 9.2 Add test scripts

  - Add test scripts to root `package.json`
  - Add test scripts to `apps/api/package.json`
  - Add test scripts to `apps/web/package.json`
  - Configure turbo.json for test orchestration
  - _Requirements: 8.2, 8.3_

- [ ] 9.3 Configure CI pipeline
  - Update GitHub Actions workflow to run integration tests
  - Update GitHub Actions workflow to run E2E tests
  - Configure test database in CI environment
  - Set up test result reporting
  - _Requirements: 8.2, 8.3_
