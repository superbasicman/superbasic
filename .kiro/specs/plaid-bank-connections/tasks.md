# Phase 4: Plaid Integration - Implementation Tasks

## Overview

This document breaks down Phase 4 (Plaid Integration) into granular, actionable tasks with time estimates. Tasks are organized by domain layer and follow the established service/repository pattern.

**Total Estimated Time:** 32-40 hours (4-5 days)

---

## Task Group 1: Database Schema & Migration (4 hours)

### Task 1.1: Create Prisma Schema for Plaid Tables
**Estimate:** 1 hour

**Description:**
Add `PlaidItem`, `PlaidAccount`, and `PlaidWebhook` models to `packages/database/schema.prisma`.

**Acceptance Criteria:**
- [ ] `PlaidItem` model with all fields from design.md
- [ ] `PlaidAccount` model with all fields from design.md
- [ ] `PlaidWebhook` model with all fields from design.md
- [ ] Foreign key relationships defined
- [ ] Indexes added for performance
- [ ] `@db.Decimal(19, 4)` precision for balance fields
- [ ] Cascade delete rules configured

**Files to Create/Modify:**
- `packages/database/schema.prisma`

### Task 1.2: Generate and Test Migration
**Estimate:** 1 hour

**Description:**
Generate Prisma migration and test against development database.

**Acceptance Criteria:**
- [ ] Migration generated with `prisma migrate dev`
- [ ] Migration applies cleanly to empty database
- [ ] Migration applies cleanly to database with existing data
- [ ] All indexes created successfully
- [ ] Foreign key constraints working

**Commands:**
```bash
cd packages/database
pnpm prisma migrate dev --name add_plaid_tables
pnpm prisma generate
```

### Task 1.3: Add Plaid Types to @repo/database
**Estimate:** 1 hour

**Description:**
Export Plaid types from database package for use in core package.

**Acceptance Criteria:**
- [ ] `PlaidItem`, `PlaidAccount`, `PlaidWebhook` types exported
- [ ] Types available in `@repo/database` imports
- [ ] TypeScript builds successfully

**Files to Create/Modify:**
- `packages/database/src/index.ts`

### Task 1.4: Create Test Data Factories
**Estimate:** 1 hour

**Description:**
Create factory functions for generating test Plaid data.

**Acceptance Criteria:**
- [ ] `createTestPlaidItem()` factory
- [ ] `createTestPlaidAccount()` factory
- [ ] `createTestPlaidWebhook()` factory
- [ ] Factories support custom overrides
- [ ] Factories used in test setup

**Files to Create:**
- `packages/core/src/plaid/__tests__/factories.ts`

---

## Task Group 2: Plaid SDK Integration (3 hours)

### Task 2.1: Install Plaid SDK
**Estimate:** 0.5 hours

**Description:**
Install `plaid` npm package and configure TypeScript types.

**Acceptance Criteria:**
- [ ] `plaid` package installed in `@repo/core`
- [ ] TypeScript types working
- [ ] Package builds successfully

**Commands:**
```bash
cd packages/core
pnpm add plaid
```

### Task 2.2: Create Plaid Client Wrapper
**Estimate:** 1.5 hours

**Description:**
Create wrapper around Plaid SDK for easier testing and error handling.

**Acceptance Criteria:**
- [ ] `PlaidClient` class in `packages/core/src/plaid/plaid-client.ts`
- [ ] Environment-based configuration (sandbox/development/production)
- [ ] Methods: `createLinkToken()`, `exchangePublicToken()`, `getAccounts()`, `getAuth()`
- [ ] Error handling with custom error classes
- [ ] Unit tests with mocked Plaid SDK

**Files to Create:**
- `packages/core/src/plaid/plaid-client.ts`
- `packages/core/src/plaid/__tests__/plaid-client.test.ts`

### Task 2.3: Create Encryption Utilities
**Estimate:** 1 hour

**Description:**
Implement AES-256-GCM encryption for access tokens.

**Acceptance Criteria:**
- [ ] `encryptAccessToken()` function
- [ ] `decryptAccessToken()` function
- [ ] Uses `PLAID_ENCRYPTION_KEY` from environment
- [ ] Includes IV and auth tag in output
- [ ] Unit tests verify encryption/decryption roundtrip
- [ ] Unit tests verify tamper detection

**Files to Create:**
- `packages/core/src/plaid/encryption.ts`
- `packages/core/src/plaid/__tests__/encryption.test.ts`

---

## Task Group 3: Repository Layer (5 hours)

### Task 3.1: Create Plaid Repository Interface
**Estimate:** 0.5 hours

**Description:**
Define TypeScript interfaces for repository methods.

**Acceptance Criteria:**
- [ ] `PlaidRepository` interface defined
- [ ] Input/output types defined
- [ ] JSDoc comments for all methods

**Files to Create:**
- `packages/core/src/plaid/plaid-types.ts`

### Task 3.2: Implement PlaidItem Repository Methods
**Estimate:** 2 hours

**Description:**
Implement CRUD operations for `PlaidItem` model.

**Acceptance Criteria:**
- [ ] `createItem()` - Create new Plaid item
- [ ] `updateItem()` - Update item status/error
- [ ] `getItemById()` - Get item by internal ID
- [ ] `getItemByPlaidItemId()` - Get item by Plaid's item_id
- [ ] `getItemsByUserId()` - Get all items for user
- [ ] Integration tests with test database
- [ ] All tests passing

**Files to Create:**
- `packages/core/src/plaid/plaid-repository.ts`
- `packages/core/src/plaid/__tests__/plaid-repository.test.ts`

### Task 3.3: Implement PlaidAccount Repository Methods
**Estimate:** 1.5 hours

**Description:**
Implement CRUD operations for `PlaidAccount` model.

**Acceptance Criteria:**
- [ ] `createAccount()` - Create new account
- [ ] `updateAccount()` - Update account balance
- [ ] `getAccountsByItemId()` - Get all accounts for item
- [ ] `upsertAccounts()` - Bulk upsert accounts (for sync)
- [ ] Integration tests with test database
- [ ] All tests passing

**Files to Modify:**
- `packages/core/src/plaid/plaid-repository.ts`
- `packages/core/src/plaid/__tests__/plaid-repository.test.ts`

### Task 3.4: Implement PlaidWebhook Repository Methods
**Estimate:** 1 hour

**Description:**
Implement operations for `PlaidWebhook` model.

**Acceptance Criteria:**
- [ ] `createWebhook()` - Log webhook event
- [ ] `markWebhookProcessed()` - Mark as processed
- [ ] `getUnprocessedWebhooks()` - Get pending webhooks
- [ ] Integration tests with test database
- [ ] All tests passing

**Files to Modify:**
- `packages/core/src/plaid/plaid-repository.ts`
- `packages/core/src/plaid/__tests__/plaid-repository.test.ts`

---

## Task Group 4: Service Layer (8 hours)

### Task 4.1: Create Plaid Error Classes
**Estimate:** 0.5 hours

**Description:**
Define domain-specific error classes for Plaid operations.

**Acceptance Criteria:**
- [ ] `PlaidConnectionError` - Generic connection error
- [ ] `PlaidItemNotFoundError` - Item not found
- [ ] `PlaidInvalidTokenError` - Invalid/expired token
- [ ] `PlaidInstitutionDownError` - Institution unavailable
- [ ] `PlaidItemLockedError` - Requires re-authentication
- [ ] All errors extend `Error` with proper names

**Files to Create:**
- `packages/core/src/plaid/plaid-errors.ts`

### Task 4.2: Implement createLinkToken Service Method
**Estimate:** 2 hours

**Description:**
Implement link token creation for Plaid Link initialization.

**Acceptance Criteria:**
- [ ] `createLinkToken()` method in `PlaidService`
- [ ] Supports `create` and `update` modes
- [ ] Includes user context in Plaid request
- [ ] Sets webhook URL
- [ ] Returns link token and expiration
- [ ] Unit tests with mocked Plaid client
- [ ] Error handling for Plaid API failures

**Files to Create:**
- `packages/core/src/plaid/plaid-service.ts`
- `packages/core/src/plaid/__tests__/plaid-service.test.ts`

### Task 4.3: Implement exchangePublicToken Service Method
**Estimate:** 2.5 hours

**Description:**
Implement public token exchange and connection creation.

**Acceptance Criteria:**
- [ ] `exchangePublicToken()` method in `PlaidService`
- [ ] Exchanges public token with Plaid
- [ ] Encrypts access token before storage
- [ ] Creates `PlaidItem` record
- [ ] Fetches and stores account metadata
- [ ] Returns item and accounts
- [ ] Unit tests with mocked dependencies
- [ ] Error handling for invalid tokens

**Files to Modify:**
- `packages/core/src/plaid/plaid-service.ts`
- `packages/core/src/plaid/__tests__/plaid-service.test.ts`

### Task 4.4: Implement syncAccounts Service Method
**Estimate:** 1.5 hours

**Description:**
Implement manual account sync to refresh balances.

**Acceptance Criteria:**
- [ ] `syncAccounts()` method in `PlaidService`
- [ ] Decrypts access token
- [ ] Fetches latest account data from Plaid
- [ ] Updates account balances in database
- [ ] Updates `lastSyncedAt` timestamp
- [ ] Returns sync summary
- [ ] Unit tests with mocked dependencies
- [ ] Error handling for locked items

**Files to Modify:**
- `packages/core/src/plaid/plaid-service.ts`
- `packages/core/src/plaid/__tests__/plaid-service.test.ts`

### Task 4.5: Implement getConnections Service Method
**Estimate:** 1 hour

**Description:**
Implement connection listing with account details.

**Acceptance Criteria:**
- [ ] `getConnections()` method in `PlaidService`
- [ ] Returns items with nested accounts
- [ ] Filters by userId
- [ ] Excludes deleted items
- [ ] Unit tests with mocked repository
- [ ] Proper error handling

**Files to Modify:**
- `packages/core/src/plaid/plaid-service.ts`
- `packages/core/src/plaid/__tests__/plaid-service.test.ts`

### Task 4.6: Implement handleWebhook Service Method
**Estimate:** 1.5 hours

**Description:**
Implement webhook event processing.

**Acceptance Criteria:**
- [ ] `handleWebhook()` method in `PlaidService`
- [ ] Logs webhook to database
- [ ] Handles `ITEM_LOGIN_REQUIRED` event (update status)
- [ ] Handles `ERROR` event (log error details)
- [ ] Marks webhook as processed
- [ ] Unit tests for each webhook type
- [ ] Idempotent processing

**Files to Modify:**
- `packages/core/src/plaid/plaid-service.ts`
- `packages/core/src/plaid/__tests__/plaid-service.test.ts`

---

## Task Group 5: API Route Handlers (6 hours)

### Task 5.1: Create POST /v1/plaid/link-token Route
**Estimate:** 1 hour

**Description:**
Create route handler for link token creation.

**Acceptance Criteria:**
- [ ] Route handler in `apps/api/src/routes/v1/plaid/link-token.ts`
- [ ] Requires session or PAT auth with `write:connections` scope
- [ ] Validates request with Zod schema
- [ ] Delegates to `plaidService.createLinkToken()`
- [ ] Maps domain errors to HTTP status codes
- [ ] Integration tests with test database
- [ ] Handler < 30 lines

**Files to Create:**
- `apps/api/src/routes/v1/plaid/link-token.ts`
- `apps/api/src/routes/v1/plaid/__tests__/link-token.test.ts`

### Task 5.2: Create POST /v1/plaid/exchange Route
**Estimate:** 1.5 hours

**Description:**
Create route handler for public token exchange.

**Acceptance Criteria:**
- [ ] Route handler in `apps/api/src/routes/v1/plaid/exchange.ts`
- [ ] Requires session or PAT auth with `write:connections` scope
- [ ] Validates request with Zod schema
- [ ] Delegates to `plaidService.exchangePublicToken()`
- [ ] Maps domain errors to HTTP status codes
- [ ] Integration tests with test database
- [ ] Handler < 30 lines

**Files to Create:**
- `apps/api/src/routes/v1/plaid/exchange.ts`
- `apps/api/src/routes/v1/plaid/__tests__/exchange.test.ts`

### Task 5.3: Create GET /v1/plaid/connections Route
**Estimate:** 1 hour

**Description:**
Create route handler for listing connections.

**Acceptance Criteria:**
- [ ] Route handler in `apps/api/src/routes/v1/plaid/connections.ts`
- [ ] Requires session or PAT auth with `read:connections` scope
- [ ] Delegates to `plaidService.getConnections()`
- [ ] Returns connections with nested accounts
- [ ] Integration tests with test database
- [ ] Handler < 20 lines

**Files to Create:**
- `apps/api/src/routes/v1/plaid/connections.ts`
- `apps/api/src/routes/v1/plaid/__tests__/connections.test.ts`

### Task 5.4: Create POST /v1/plaid/sync Route
**Estimate:** 1 hour

**Description:**
Create route handler for manual account sync.

**Acceptance Criteria:**
- [ ] Route handler in `apps/api/src/routes/v1/plaid/sync.ts`
- [ ] Requires session or PAT auth with `write:connections` scope
- [ ] Rate limited (3 per hour per connection)
- [ ] Validates request with Zod schema
- [ ] Delegates to `plaidService.syncAccounts()`
- [ ] Maps domain errors to HTTP status codes
- [ ] Integration tests with test database
- [ ] Handler < 30 lines

**Files to Create:**
- `apps/api/src/routes/v1/plaid/sync.ts`
- `apps/api/src/routes/v1/plaid/__tests__/sync.test.ts`

### Task 5.5: Create POST /v1/webhooks/plaid Route
**Estimate:** 1.5 hours

**Description:**
Create webhook handler for Plaid events.

**Acceptance Criteria:**
- [ ] Route handler in `apps/api/src/routes/v1/webhooks/plaid.ts`
- [ ] Verifies HMAC signature
- [ ] Delegates to `plaidService.handleWebhook()`
- [ ] Returns 200 for all valid webhooks
- [ ] Logs webhook processing errors
- [ ] Integration tests with mocked signatures
- [ ] Handler < 25 lines

**Files to Create:**
- `apps/api/src/routes/v1/webhooks/plaid.ts`
- `apps/api/src/routes/v1/webhooks/__tests__/plaid.test.ts`
- `packages/core/src/plaid/webhook-verification.ts`

### Task 5.6: Register Plaid Routes in App
**Estimate:** 0.5 hours

**Description:**
Mount Plaid routes in main API app.

**Acceptance Criteria:**
- [ ] Routes mounted at `/v1/plaid/*` and `/v1/webhooks/plaid`
- [ ] Service registry includes `plaidService`
- [ ] TypeScript builds successfully
- [ ] All routes accessible

**Files to Modify:**
- `apps/api/src/app.ts`
- `apps/api/src/services/index.ts`

---

## Task Group 6: Web Client Integration (8 hours)

### Task 6.1: Install react-plaid-link
**Estimate:** 0.5 hours

**Description:**
Install Plaid Link React component.

**Acceptance Criteria:**
- [ ] `react-plaid-link` installed in `apps/web`
- [ ] TypeScript types working
- [ ] Package builds successfully

**Commands:**
```bash
cd apps/web
pnpm add react-plaid-link
```

### Task 6.2: Create Plaid API Client Methods
**Estimate:** 1 hour

**Description:**
Add Plaid endpoints to web client API wrapper.

**Acceptance Criteria:**
- [ ] `plaidApi.createLinkToken()` method
- [ ] `plaidApi.exchangePublicToken()` method
- [ ] `plaidApi.getConnections()` method
- [ ] `plaidApi.syncAccounts()` method
- [ ] TypeScript types for requests/responses

**Files to Modify:**
- `apps/web/src/lib/api.ts` (or create `apps/web/src/lib/plaid-api.ts`)

### Task 6.3: Create PlaidLink Component
**Estimate:** 2 hours

**Description:**
Create reusable Plaid Link component.

**Acceptance Criteria:**
- [ ] `PlaidLink` component in `apps/web/src/components/PlaidLink.tsx`
- [ ] Fetches link token on mount
- [ ] Initializes Plaid Link with token
- [ ] Handles success callback (exchanges public token)
- [ ] Handles error callback
- [ ] Shows loading state
- [ ] TypeScript types for props

**Files to Create:**
- `apps/web/src/components/PlaidLink.tsx`

### Task 6.4: Create Connections List Page
**Estimate:** 2.5 hours

**Description:**
Create page to display connected bank accounts.

**Acceptance Criteria:**
- [ ] `/connections` route in React Router
- [ ] Fetches connections on mount
- [ ] Displays institution name and logo
- [ ] Displays account list with balances
- [ ] Shows connection status (active/error)
- [ ] "Connect Bank" button (opens PlaidLink)
- [ ] "Sync" button per connection
- [ ] Loading and error states
- [ ] Responsive design

**Files to Create:**
- `apps/web/src/pages/Connections.tsx`

### Task 6.5: Add Connection Status Indicators
**Estimate:** 1 hour

**Description:**
Create UI components for connection status.

**Acceptance Criteria:**
- [ ] Status badge component (active/error/syncing)
- [ ] Error message display
- [ ] "Re-authenticate" button for error status
- [ ] Last synced timestamp
- [ ] Visual indicators (icons, colors)

**Files to Create:**
- `apps/web/src/components/ConnectionStatus.tsx`

### Task 6.6: Add Navigation Link
**Estimate:** 0.5 hours

**Description:**
Add "Connections" link to main navigation.

**Acceptance Criteria:**
- [ ] Link in sidebar/header navigation
- [ ] Active state styling
- [ ] Icon for connections

**Files to Modify:**
- `apps/web/src/components/Navigation.tsx` (or similar)

### Task 6.7: Create E2E Tests for Connection Flow
**Estimate:** 1.5 hours

**Description:**
Create Playwright tests for bank connection flow.

**Acceptance Criteria:**
- [ ] Test: User can open Plaid Link
- [ ] Test: User can connect bank (Sandbox)
- [ ] Test: Connection appears in list
- [ ] Test: User can sync accounts
- [ ] Test: User can see error status
- [ ] All tests passing

**Files to Create:**
- `apps/web/e2e/plaid-connection.spec.ts`

---

## Task Group 7: Scopes & Documentation (3 hours)

### Task 7.1: Add Plaid Scopes to Auth System
**Estimate:** 1 hour

**Description:**
Add `read:connections` and `write:connections` scopes.

**Acceptance Criteria:**
- [ ] Scopes added to `VALID_SCOPES` array
- [ ] Scope descriptions documented
- [ ] PAT creation UI includes new scopes
- [ ] Scope enforcement tested

**Files to Modify:**
- `packages/auth/src/scopes.ts` (or similar)
- `apps/web/src/pages/Tokens.tsx` (or similar)

### Task 7.2: Update API Documentation
**Estimate:** 1.5 hours

**Description:**
Document Plaid endpoints in API docs.

**Acceptance Criteria:**
- [ ] All 5 endpoints documented
- [ ] Request/response examples
- [ ] Error codes documented
- [ ] Scope requirements listed
- [ ] Webhook signature verification explained

**Files to Modify:**
- `docs/api-authentication.md` (or create `docs/api-plaid.md`)

### Task 7.3: Create Plaid Setup Guide
**Estimate:** 0.5 hours

**Description:**
Document how to set up Plaid credentials.

**Acceptance Criteria:**
- [ ] Instructions for creating Plaid account
- [ ] How to get API keys
- [ ] Environment variable setup
- [ ] Sandbox vs Production differences
- [ ] Webhook configuration

**Files to Create:**
- `docs/plaid-setup-guide.md`

---

## Task Group 8: Testing & Verification (3 hours)

### Task 8.1: Run Full Test Suite
**Estimate:** 0.5 hours

**Description:**
Verify all tests pass after Plaid integration.

**Acceptance Criteria:**
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All E2E tests passing
- [ ] No test regressions

**Commands:**
```bash
pnpm test
pnpm test:e2e
```

### Task 8.2: Manual Testing with Plaid Sandbox
**Estimate:** 1.5 hours

**Description:**
Manually test complete flow with Plaid Sandbox.

**Acceptance Criteria:**
- [ ] Can create link token
- [ ] Can open Plaid Link
- [ ] Can connect test bank
- [ ] Accounts appear in list
- [ ] Can sync accounts
- [ ] Balances update correctly
- [ ] Error states work (test with invalid credentials)
- [ ] Webhook events processed

### Task 8.3: Performance Testing
**Estimate:** 1 hour

**Description:**
Verify performance meets requirements.

**Acceptance Criteria:**
- [ ] Link token creation < 1 second
- [ ] Public token exchange < 3 seconds
- [ ] Account sync < 5 seconds
- [ ] Webhook processing < 2 seconds
- [ ] No N+1 queries in connection list

---

## Task Dependencies

```
Group 1 (Database) → Group 2 (SDK) → Group 3 (Repository) → Group 4 (Service) → Group 5 (API Routes)
                                                                                    ↓
                                                                              Group 6 (Web Client)
                                                                                    ↓
                                                                              Group 7 (Docs)
                                                                                    ↓
                                                                              Group 8 (Testing)
```

## Estimated Timeline

**Week 1 (Days 1-3):**
- Day 1: Groups 1-2 (Database + SDK)
- Day 2: Group 3 (Repository)
- Day 3: Group 4 (Service)

**Week 2 (Days 4-5):**
- Day 4: Groups 5-6 (API Routes + Web Client)
- Day 5: Groups 7-8 (Docs + Testing)

## Risk Mitigation

**Risk:** Plaid API rate limits during development
**Mitigation:** Use Sandbox environment, implement request caching

**Risk:** Access token encryption key management
**Mitigation:** Use environment variables, document key rotation process

**Risk:** Webhook signature verification failures
**Mitigation:** Comprehensive tests, logging for debugging

**Risk:** Connection errors difficult to debug
**Mitigation:** Detailed error logging, user-friendly error messages

## Success Criteria

- [ ] All 40+ tasks completed
- [ ] All tests passing (unit, integration, E2E)
- [ ] TypeScript builds with no errors
- [ ] Linting passes
- [ ] Manual testing successful
- [ ] Performance requirements met
- [ ] Documentation complete
- [ ] Code reviewed and approved
