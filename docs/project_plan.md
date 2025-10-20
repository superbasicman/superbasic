# SuperBasic Finance - Project Plan

## Overview

This document provides a high-level roadmap for building SuperBasic Finance, an API-first personal finance platform. The plan is organized into phases with clear exit criteria, building from foundational infrastructure through core features to advanced capabilities. Each phase represents a deployable milestone that delivers user value while maintaining production quality.

**Current Status**: Phase 1 & 2 complete with comprehensive E2E testing, ready for Phase 3 (API Key Management)

## Guiding Principles

- **API-first**: All features exposed via stable /v1 JSON endpoints
- **Thin client**: Web app consumes only public API, no direct database access
- **Security by design**: Authentication, authorization, rate limiting, and audit logging from day one
- **Incremental delivery**: Each phase is independently deployable and valuable
- **Production-ready**: No "we'll fix it later" - proper error handling, logging, and testing throughout

---

## Phase 1: Foundation & Infrastructure ✅

**Goal**: Establish monorepo structure, tooling, and development workflow

**Status**: COMPLETE

### Deliverables

- [x] Monorepo structure with pnpm workspaces
- [x] Turborepo build orchestration
- [x] TypeScript configuration with strict mode
- [x] Biome linting and formatting
- [x] Vitest and Playwright test infrastructure
- [x] API skeleton (Hono + Node adapter)
- [x] Web client skeleton (Vite + React 19)
- [x] Shared packages structure (@repo/\*)
- [x] Prisma setup with basic User model
- [x] Development scripts (dev, build, test, lint)

### Exit Criteria

- ✅ `pnpm install` completes without errors
- ✅ `pnpm dev` starts both API and web client
- ✅ `pnpm build` compiles all packages and apps
- ✅ `pnpm lint` and `pnpm typecheck` pass
- ✅ Basic health check endpoint returns 200
- ✅ Web client renders placeholder home page

**Spec**: `.kiro/specs/monorepo-initialization/`

---

## Phase 2: Authentication & Session Management ✅

**Goal**: Secure user authentication with Auth.js, JWT sessions, and protected routes

**Status**: COMPLETE

### Deliverables

- [x] Auth.js configuration with Credentials provider
- [x] Password hashing utilities (bcrypt)
- [x] JWT session management with httpOnly cookies
- [x] Authentication middleware for protected routes
- [x] User registration endpoint (POST /v1/register)
- [x] Login endpoint (POST /v1/login)
- [x] Logout endpoint (POST /v1/logout)
- [x] Session endpoint (GET /v1/me)
- [x] CORS middleware with credentials support
- [x] Rate limiting on auth endpoints (10 req/min per IP)
- [x] Authentication event emitter for audit logging
- [x] Web client auth context provider
- [x] Login and registration UI pages
- [x] Protected route wrapper component
- [x] Audit logging with structured Pino logger
- [x] Profiles table for user preferences and business data
- [x] User/profile reference strategy (users.id for auth, profiles.id for business logic)
- [x] Middleware enhancement to attach both userId and profileId
- [x] Prisma client caching fix for schema updates

### Exit Criteria

- ✅ Users can register with email/password
- ✅ Users can log in and receive httpOnly session cookie
- ✅ Session persists across page refreshes (30-day expiration)
- ✅ Protected API routes return 401 for unauthenticated requests
- ✅ Users can log out and session is cleared
- ✅ Rate limiting prevents brute force attacks (10 req/min per IP)
- ✅ All auth events logged with user ID, timestamp, IP, success/failure
- ✅ Upstash Redis configured and rate limiting verified working
- ✅ Sliding window rate limiter implemented with Redis sorted sets
- ✅ Integration tests cover registration, login, logout, session flows
- ✅ E2E tests verify complete authentication journey (29 comprehensive tests)
- ✅ One-command E2E test runner with automatic server management
- ✅ Profiles table created with migration and backfill script
- ✅ Auth middleware attaches both userId (auth) and profileId (business logic)
- ✅ All 102 tests passing (unit, integration, and E2E)

**Specs**:

- `.kiro/specs/authentication-foundation/` - Core authentication implementation
- `.kiro/specs/authentication-testing/` - Comprehensive test suite

**Notes**: Core authentication functionality is complete and production-ready with comprehensive test coverage. Rate limiting is fully implemented with Upstash Redis using a sliding window algorithm. The system gracefully fails open if Redis becomes unavailable. All 102 tests passing (unit, integration, and E2E). The profiles table separates Auth.js identity (users) from user preferences/business data (profiles), with middleware attaching both IDs to request context. A Prisma client caching fix ensures schema updates are picked up automatically.

---

## Phase 3: API Key Management (PATs)

**Goal**: Enable programmatic API access with Personal Access Tokens

**Status**: Task 2 complete (Core token utilities) - Token generation, SHA-256 hashing, and scope validation implemented with 64 passing tests

### Deliverables

- [x] PAT generation with secure random tokens (sbf_ prefix + base64url encoding)
- [x] Token hashing (SHA-256) before database storage
- [x] Token format validation and scope utilities
- [x] Unit tests for token generation, hashing, and scope validation (64 tests passing)
- [ ] PAT CRUD endpoints (POST /v1/tokens, GET /v1/tokens, DELETE /v1/tokens/:id)
- [ ] Bearer token authentication middleware (separate from session auth)
- [ ] Token scopes and permissions (read:transactions, write:budgets, etc.)
- [ ] Token expiration and revocation
- [ ] Last used timestamp tracking
- [ ] Web UI for managing API keys
- [ ] Token creation flow (show plaintext once, then hash)
- [ ] Token list with masked values and metadata
- [ ] Token revocation with confirmation dialog

### Exit Criteria

- [ ] Users can create API keys with custom names and scopes
- [ ] Plaintext token shown once on creation, then never again
- [ ] API requests with `Authorization: Bearer <token>` authenticate successfully
- [ ] Invalid or expired tokens return 401
- [ ] Token scopes enforced on protected endpoints
- [ ] Users can list and revoke their tokens
- [ ] Audit log records token creation, usage, and revocation
- [ ] Integration tests cover token lifecycle
- [ ] Documentation includes API authentication guide

**Spec**: `.kiro/specs/api-key-management/` (to be created)

---

## Phase 4: Plaid Integration - Bank Connections

**Goal**: Connect bank accounts via Plaid Link and sync account metadata

### Deliverables

- [ ] Plaid client configuration (@plaid/plaid SDK)
- [ ] Link token creation endpoint (POST /v1/plaid/link-token)
- [ ] Public token exchange endpoint (POST /v1/plaid/exchange)
- [ ] Plaid Item and Account models in Prisma schema
- [ ] Account sync endpoint (POST /v1/plaid/sync)
- [ ] Webhook handler for Plaid events (POST /v1/webhooks/plaid)
- [ ] Web client Plaid Link integration (react-plaid-link)
- [ ] Bank connection UI flow
- [ ] Connected accounts list view
- [ ] Account reconnection flow for expired credentials
- [ ] Error handling for Plaid API failures

### Exit Criteria

- [ ] Users can initiate Plaid Link from web client
- [ ] Link token generated server-side with user context
- [ ] Public token exchanged for access token (server-side only)
- [ ] Bank accounts stored in database with metadata (name, type, balance)
- [ ] Users can view connected accounts in dashboard
- [ ] Webhook handler processes Plaid events (item errors, updates)
- [ ] Expired connections prompt re-authentication
- [ ] Integration tests mock Plaid API responses
- [ ] E2E tests verify connection flow (using Plaid Sandbox)

**Spec**: `.kiro/specs/plaid-bank-connections/` (to be created)

---

## Phase 5: Transaction Sync & Ledger

**Goal**: Fetch transactions from Plaid and store in append-only ledger

### Deliverables

- [ ] Transaction model in Prisma schema (append-only)
- [ ] Plaid transaction sync logic with cursor-based pagination
- [ ] Background job for initial sync (Upstash QStash)
- [ ] Manual "Sync Now" endpoint (POST /v1/plaid/sync-now)
- [ ] Processed events table for idempotency
- [ ] Transaction list endpoint (GET /v1/transactions)
- [ ] Transaction detail endpoint (GET /v1/transactions/:id)
- [ ] Filtering and pagination (date range, account, category)
- [ ] Transaction categorization (Plaid categories)
- [ ] Web client transaction list view
- [ ] Transaction detail modal
- [ ] Sync status indicator and progress tracking

### Exit Criteria

- [ ] Initial sync fetches all historical transactions (up to 2 years)
- [ ] Incremental syncs fetch only new transactions
- [ ] Transactions stored with Plaid ID, amount, date, merchant, category
- [ ] Duplicate transactions prevented via processed_events table
- [ ] Users can view paginated transaction list
- [ ] Filters work correctly (date range, account, category)
- [ ] Manual sync completes within 10 seconds for typical accounts
- [ ] Background jobs handle large syncs without timeout
- [ ] Sync errors logged and surfaced to user
- [ ] Integration tests verify sync logic with mock data

**Spec**: `.kiro/specs/transaction-sync-ledger/` (to be created)

---

## Phase 6: Workspace Multi-Tenancy

**Goal**: Support multiple workspaces with role-based access control

### Deliverables

- [ ] Workspace model in Prisma schema
- [ ] WorkspaceMember model with role (owner, admin, member, viewer)
- [ ] RBAC scope definitions in @repo/auth
- [ ] Workspace CRUD endpoints (POST /v1/workspaces, GET /v1/workspaces, etc.)
- [ ] Workspace member management endpoints
- [ ] Workspace invitation flow (email-based)
- [ ] Row-level security policies in Postgres
- [ ] Workspace context middleware (sets pg_set_config)
- [ ] Web client workspace switcher
- [ ] Workspace settings page
- [ ] Member management UI
- [ ] Invitation acceptance flow
- [ ] **Update API documentation** (docs/api-authentication.md) to add workspace scopes (`read:workspaces`, `write:workspaces`)

### Exit Criteria

- [ ] Users can create multiple workspaces
- [ ] Users can invite others to workspaces with specific roles
- [ ] Role permissions enforced on all API endpoints
- [ ] Data scoped to workspace (users can't access other workspaces' data)
- [ ] Workspace switcher updates context and refetches data
- [ ] Owners can manage members and roles
- [ ] Members can leave workspaces
- [ ] Audit log records workspace actions
- [ ] Integration tests verify RBAC enforcement
- [ ] E2E tests cover workspace creation and member management

**Spec**: `.kiro/specs/workspace-multi-tenancy/` (to be created)

---

## Phase 7: Stripe Billing Integration

**Goal**: Subscription management with Stripe Checkout and Customer Portal

### Deliverables

- [ ] Stripe SDK configuration (@stripe/stripe-js, stripe)
- [ ] Stripe Customer and Subscription models in Prisma schema
- [ ] Checkout session creation endpoint (POST /v1/billing/checkout)
- [ ] Customer Portal session endpoint (POST /v1/billing/portal)
- [ ] Webhook handler for Stripe events (POST /v1/webhooks/stripe)
- [ ] Subscription status tracking (active, past_due, canceled)
- [ ] Usage-based billing logic (transaction count, API calls)
- [ ] Billing page in web client
- [ ] Subscription status display
- [ ] Upgrade/downgrade flow
- [ ] Payment method management via Customer Portal

### Exit Criteria

- [ ] Users can subscribe to paid plans via Stripe Checkout
- [ ] Checkout redirects back to app after payment
- [ ] Subscription status synced via webhooks
- [ ] Users can manage billing via Stripe Customer Portal
- [ ] Subscription changes reflected in app immediately
- [ ] Usage limits enforced based on plan (e.g., transaction count)
- [ ] Webhook signatures verified with HMAC
- [ ] Failed payments trigger email notifications
- [ ] Integration tests mock Stripe API responses
- [ ] E2E tests verify checkout flow (using Stripe test mode)

**Spec**: `.kiro/specs/stripe-billing-integration/` (to be created)

---

## Phase 8: Budgets & Spending Insights

**Goal**: Create budgets and track spending against categories

### Deliverables

- [ ] Budget model in Prisma schema (category, amount, period)
- [ ] Budget CRUD endpoints (POST /v1/budgets, GET /v1/budgets, etc.)
- [ ] Spending calculation logic (aggregate transactions by category)
- [ ] Budget progress endpoint (GET /v1/budgets/:id/progress)
- [ ] Budget alerts (email when 80% spent, 100% spent)
- [ ] Web client budget creation form
- [ ] Budget list view with progress bars
- [ ] Budget detail page with transaction breakdown
- [ ] Spending insights dashboard (top categories, trends)

### Exit Criteria

- [ ] Users can create budgets for specific categories and time periods
- [ ] Budget progress calculated from transaction data
- [ ] Progress bars show spending vs. budget
- [ ] Alerts sent when thresholds exceeded
- [ ] Users can edit and delete budgets
- [ ] Spending insights show top categories and trends
- [ ] Charts visualize spending over time
- [ ] Integration tests verify budget calculations
- [ ] E2E tests cover budget creation and progress tracking

**Spec**: `.kiro/specs/budgets-spending-insights/` (to be created)

---

## Phase 9: Saved Views & Filters

**Goal**: Save custom transaction filters and views for quick access

### Deliverables

- [ ] SavedView model in Prisma schema (name, filters, sort)
- [ ] Saved view CRUD endpoints (POST /v1/views, GET /v1/views, etc.)
- [ ] Filter serialization/deserialization logic
- [ ] Default views (All Transactions, This Month, Last Month, etc.)
- [ ] Web client saved view selector
- [ ] View creation modal with filter builder
- [ ] View management (rename, delete, set as default)
- [ ] Quick filters (date presets, account selector, category selector)

### Exit Criteria

- [ ] Users can save custom transaction filters as named views
- [ ] Saved views appear in dropdown selector
- [ ] Selecting a view applies filters and updates transaction list
- [ ] Users can edit and delete saved views
- [ ] Default views provided out of the box
- [ ] Filters support date ranges, accounts, categories, amounts
- [ ] Integration tests verify filter logic
- [ ] E2E tests cover view creation and selection

**Spec**: `.kiro/specs/saved-views-filters/` (to be created)

---

## Phase 10: Data Export & Reporting

**Goal**: Export transaction data in multiple formats (CSV, JSON, PDF)

### Deliverables

- [ ] Export endpoint (POST /v1/exports)
- [ ] CSV generation logic (transactions, budgets, accounts)
- [ ] JSON export with full data structure
- [ ] PDF report generation (monthly summary, budget report)
- [ ] Export job queue (Upstash QStash for large exports)
- [ ] Export status tracking (pending, processing, complete, failed)
- [ ] Web client export modal with format and filter options
- [ ] Download link generation (signed S3 URLs or direct download)
- [ ] Export history page (list of past exports)

### Exit Criteria

- [ ] Users can export transactions to CSV, JSON, or PDF
- [ ] Exports respect current filters and date ranges
- [ ] Large exports processed in background without timeout
- [ ] Users notified when export is ready (email or in-app)
- [ ] Download links expire after 24 hours
- [ ] Export history shows past exports with download links
- [ ] PDF reports include charts and summaries
- [ ] Integration tests verify export formats
- [ ] E2E tests cover export flow and download

**Spec**: `.kiro/specs/data-export-reporting/` (to be created)

---

## Phase 11: OpenAPI Spec & SDK Generation

**Goal**: Auto-generate OpenAPI spec and TypeScript SDK from Zod schemas

### Deliverables

- [ ] OpenAPI spec generation script (zod-to-openapi)
- [ ] OpenAPI spec served at /v1/docs (Swagger UI)
- [ ] SDK generation script (openapi-typescript-codegen or similar)
- [ ] @repo/sdk package with generated client
- [ ] SDK documentation and usage examples
- [ ] CI pipeline for spec generation and SDK build
- [ ] Spec diffing in CI (detect breaking changes)
- [ ] Versioning strategy for SDK releases

### Exit Criteria

- [ ] OpenAPI spec generated from Zod schemas
- [ ] Spec served at /v1/docs with interactive Swagger UI
- [ ] TypeScript SDK generated from spec
- [ ] Web client uses generated SDK for all API calls
- [ ] SDK includes types, request builders, and error handling
- [ ] CI fails on breaking API changes without version bump
- [ ] SDK published to npm (or internal registry)
- [ ] Documentation includes SDK installation and usage guide

**Spec**: `.kiro/specs/openapi-sdk-generation/` (to be created)

---

## Phase 12: Observability & Monitoring

**Goal**: Structured logging, error tracking, and performance monitoring

### Deliverables

- [ ] Pino logger configuration in @repo/observability
- [ ] Request ID middleware (attach to all requests)
- [ ] Structured logging for all API requests (method, path, status, duration)
- [ ] Error logging with stack traces and context
- [ ] Sentry integration for error tracking
- [ ] Sentry source maps for production debugging
- [ ] Performance monitoring (slow queries, endpoint latency)
- [ ] Audit log table in Prisma schema
- [ ] Audit log writer (records sensitive actions)
- [ ] Log aggregation (Logtail or similar)
- [ ] Alerting for critical errors (Sentry, PagerDuty)

### Exit Criteria

- [ ] All API requests logged with request ID, user ID, duration
- [ ] Errors captured in Sentry with full context
- [ ] Source maps uploaded for production error debugging
- [ ] Slow queries logged and monitored
- [ ] Audit log records auth events, billing changes, data exports
- [ ] Logs searchable in aggregation service
- [ ] Alerts configured for critical errors (500s, auth failures)
- [ ] Dashboard shows key metrics (request rate, error rate, latency)

**Spec**: `.kiro/specs/observability-monitoring/` (to be created)

---

## Phase 13: Rate Limiting & Security Hardening

**Goal**: Comprehensive rate limiting and security best practices

### Deliverables

- [ ] Upstash Redis configuration in @repo/rate-limit
- [ ] Rate limiting middleware (per IP, per user, per API key)
- [ ] Rate limit tiers (free, pro, enterprise)
- [ ] Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, etc.)
- [ ] 429 Too Many Requests responses
- [ ] CSRF token middleware (double-submit cookie pattern)
- [ ] Content Security Policy headers
- [ ] Helmet.js integration for security headers
- [ ] Input sanitization (prevent XSS, SQL injection)
- [ ] Dependency vulnerability scanning (Snyk or similar)
- [ ] Security audit checklist
- [ ] IP address tracking for token usage (security monitoring)
- [ ] **Update API documentation** (docs/api-authentication.md) to document per-token rate limits and IP-based security features

### Exit Criteria

- [ ] Rate limits enforced on all public endpoints
- [ ] Different limits for authenticated vs. unauthenticated requests
- [ ] Rate limit headers returned in responses
- [ ] 429 responses include Retry-After header
- [ ] CSRF tokens validated on state-changing requests
- [ ] CSP headers prevent XSS attacks
- [ ] Security headers configured (HSTS, X-Frame-Options, etc.)
- [ ] Input validation prevents injection attacks
- [ ] Dependency vulnerabilities scanned in CI
- [ ] Security audit completed and issues resolved

**Spec**: `.kiro/specs/rate-limiting-security/` (to be created)

---

## Phase 14: Email Notifications & Alerts

**Goal**: Transactional emails and user-configurable alerts

### Deliverables

- [ ] Email service configuration (SendGrid, Postmark, or Resend)
- [ ] Email templates (welcome, password reset, budget alerts, etc.)
- [ ] Email sending utilities in @repo/observability
- [ ] Notification preferences model in Prisma schema
- [ ] Notification settings endpoint (GET /v1/settings/notifications)
- [ ] Email verification flow (send verification email, verify token)
- [ ] Password reset flow (send reset email, verify token, update password)
- [ ] Budget alert emails (80% spent, 100% spent)
- [ ] Transaction alert emails (large transactions, unusual activity)
- [ ] Web client notification settings page
- [ ] Email unsubscribe flow

### Exit Criteria

- [ ] Welcome email sent on registration
- [ ] Email verification required before full access
- [ ] Password reset flow works end-to-end
- [ ] Budget alerts sent when thresholds exceeded
- [ ] Users can configure notification preferences
- [ ] Emails rendered correctly in major clients (Gmail, Outlook, etc.)
- [ ] Unsubscribe links work and update preferences
- [ ] Email delivery monitored (bounce rate, open rate)
- [ ] Integration tests mock email sending
- [ ] E2E tests verify email flows (using test email service)

**Spec**: `.kiro/specs/email-notifications-alerts/` (to be created)

---

## Phase 15: Mobile App Preparation (Capacitor)

**Goal**: Prepare web client for wrapping with Capacitor for iOS/Android

### Deliverables

- [ ] Capacitor configuration (capacitor.config.ts)
- [ ] iOS and Android project scaffolding
- [ ] Native splash screen and app icons
- [ ] Capacitor plugins (Storage, StatusBar, Keyboard, etc.)
- [ ] Offline support (service worker, IndexedDB caching)
- [ ] Push notification setup (Firebase Cloud Messaging)
- [ ] Biometric authentication (Face ID, Touch ID, fingerprint)
- [ ] Deep linking configuration (app://superbasic.finance/\*)
- [ ] App store metadata (descriptions, screenshots, keywords)
- [ ] TestFlight and Google Play beta testing

### Exit Criteria

- [ ] Web client builds successfully with Capacitor
- [ ] iOS app runs on simulator and physical device
- [ ] Android app runs on emulator and physical device
- [ ] Offline mode caches critical data
- [ ] Push notifications received on mobile devices
- [ ] Biometric authentication works on supported devices
- [ ] Deep links open app to correct screen
- [ ] App submitted to TestFlight and Google Play beta
- [ ] Beta testers can install and use app
- [ ] App store listings prepared (pending public launch)

**Spec**: `.kiro/specs/mobile-app-capacitor/` (to be created)

---

## Phase 16: Advanced Features & Polish

**Goal**: Enhancements based on user feedback and analytics

### Potential Deliverables (prioritize based on feedback)

- [ ] Recurring transaction detection and categorization
- [ ] Net worth tracking (assets - liabilities)
- [ ] Investment account support (Plaid Investments API)
- [ ] Bill reminders and payment tracking
- [ ] Financial goal setting and progress tracking
- [ ] Multi-currency support
- [ ] Dark mode theme
- [ ] Accessibility improvements (WCAG 2.1 AA compliance)
- [ ] Onboarding tutorial and tooltips
- [ ] In-app help and documentation
- [ ] User feedback widget
- [ ] Analytics dashboard (user engagement, feature usage)

### Exit Criteria

- [ ] Features prioritized based on user feedback and analytics
- [ ] Each feature has clear requirements and acceptance criteria
- [ ] Features tested and deployed incrementally
- [ ] User satisfaction metrics improve (NPS, CSAT)
- [ ] App performance optimized (load time, bundle size)
- [ ] Accessibility audit completed and issues resolved

**Spec**: Individual specs created per feature as prioritized

---

## Phase 17: Production Launch Preparation

**Goal**: Final hardening and launch readiness

### Deliverables

- [ ] Production environment setup (Vercel, Neon, Upstash)
- [ ] Domain configuration (api.superbasicfinance.com, app.superbasicfinance.com)
- [ ] SSL certificates and HTTPS enforcement
- [ ] Database backup and restore procedures
- [ ] Disaster recovery plan
- [ ] Incident response runbook
- [ ] Performance testing (load testing, stress testing)
- [ ] Security penetration testing
- [ ] Legal compliance (privacy policy, terms of service, GDPR)
- [ ] Marketing site (landing page, blog, pricing page)
- [ ] Customer support setup (help desk, chat widget)
- [ ] Launch checklist and go/no-go criteria

### Exit Criteria

- [ ] Production environment fully configured and tested
- [ ] All services running on production domains with HTTPS
- [ ] Database backups automated and tested
- [ ] Disaster recovery plan documented and rehearsed
- [ ] Performance benchmarks met (p95 latency < 200ms)
- [ ] Security audit completed with no critical issues
- [ ] Legal documents reviewed by counsel
- [ ] Marketing site live with clear value proposition
- [ ] Customer support channels operational
- [ ] Launch checklist completed and approved

**Spec**: `.kiro/specs/production-launch/` (to be created)

---

## Phase 18: Post-Launch Optimization

**Goal**: Monitor, iterate, and scale based on real-world usage

### Deliverables

- [ ] User analytics and behavior tracking
- [ ] A/B testing framework
- [ ] Feature flag system (LaunchDarkly or similar)
- [ ] Performance optimization (database indexing, query optimization)
- [ ] Cost optimization (database, API calls, storage)
- [ ] Scaling plan (database read replicas, CDN, caching)
- [ ] User feedback collection and analysis
- [ ] Bug triage and prioritization process
- [ ] Release cadence and versioning strategy
- [ ] Changelog and release notes

### Exit Criteria

- [ ] Analytics tracking key user journeys
- [ ] A/B tests running for new features
- [ ] Feature flags enable gradual rollouts
- [ ] Performance optimizations reduce latency by 20%
- [ ] Infrastructure costs optimized without sacrificing reliability
- [ ] Scaling plan tested and ready for growth
- [ ] User feedback incorporated into roadmap
- [ ] Bug fix SLAs met (critical: 24h, high: 1 week, medium: 2 weeks)
- [ ] Regular releases (weekly or bi-weekly)
- [ ] Changelog published with each release

**Spec**: Ongoing optimization, no single spec

---

## Cross-Cutting Concerns

These concerns span multiple phases and should be addressed continuously:

### Testing Strategy

- **Unit tests**: Domain logic in @repo/core, utilities in @repo/auth
- **Integration tests**: API endpoints with real database (test instance)
- **E2E tests**: Critical user flows (login, bank connection, transaction sync)
- **Contract tests**: OpenAPI spec diffing to prevent breaking changes
- **Performance tests**: Load testing before production launch

### Documentation

- **API documentation**: Auto-generated from OpenAPI spec
- **SDK documentation**: Usage examples and API reference
- **Developer guides**: Authentication, webhooks, rate limiting
- **User guides**: Getting started, connecting banks, creating budgets
- **Runbooks**: Deployment, incident response, database operations

### Documentation Maintenance

Documentation should be updated when implementing features that were marked as "future" in earlier phases:

- **Phase 6** (Workspace Multi-Tenancy):
  - Update `docs/api-authentication.md` to add workspace scopes (`read:workspaces`, `write:workspaces`)
  - Update scope enforcement table with workspace endpoints
  
- **Phase 13** (Rate Limiting & Security):
  - Update `docs/api-authentication.md` to document per-token rate limits
  - Add IP address tracking and security monitoring features
  - Update rate limiting section with tier-based limits
  
- **Phase 11** (OpenAPI Spec):
  - Migrate manual API documentation to auto-generated OpenAPI docs
  - Ensure `docs/api-authentication.md` links to interactive Swagger UI
  - Add error code standardization (ERR_INVALID_TOKEN, etc.)

**Best Practice**: When marking a feature as "future" in documentation, add a TODO comment with the phase number where it should be implemented. Example: `<!-- TODO: Phase 6 - Add workspace scopes -->`

### CI/CD Pipeline

- **Lint and typecheck**: Run on every commit
- **Unit and integration tests**: Run on every PR
- **E2E tests**: Run on main branch and before deployment
- **Build and deploy**: Automatic deployment to preview environments
- **Production deployment**: Manual approval after staging verification

### Security Practices

- **Dependency updates**: Weekly automated PRs (Dependabot or Renovate)
- **Vulnerability scanning**: Snyk or similar in CI pipeline
- **Secret management**: Environment variables, never committed
- **Audit logging**: All sensitive actions logged with context
- **Incident response**: Documented procedures and on-call rotation

---

## Success Metrics

### Phase 2-3 (Auth & API Keys)

- [ ] 100% of API endpoints require authentication
- [ ] 0 plaintext passwords or tokens in database
- [ ] < 1% failed login rate (excluding invalid credentials)
- [ ] Rate limiting prevents > 99% of brute force attempts

### Phase 4-5 (Plaid & Transactions)

- [ ] > 95% successful bank connections
- [ ] < 5 second average sync time for incremental updates
- [ ] 0 duplicate transactions in ledger
- [ ] > 99.9% transaction sync accuracy

### Phase 6-7 (Workspaces & Billing)

- [ ] > 80% of users create at least one workspace
- [ ] > 50% of workspaces have multiple members
- [ ] > 10% conversion rate from free to paid plans
- [ ] < 2% payment failure rate

### Phase 8-10 (Budgets, Views, Exports)

- [ ] > 60% of users create at least one budget
- [ ] > 40% of users save custom views
- [ ] > 20% of users export data at least once
- [ ] > 80% user satisfaction with budgeting features

### Phase 11-14 (SDK, Observability, Security)

- [ ] 100% API coverage in OpenAPI spec
- [ ] < 0.1% error rate in production
- [ ] < 200ms p95 API latency
- [ ] 0 critical security vulnerabilities

### Phase 15-17 (Mobile & Launch)

- [ ] > 4.0 star rating on App Store and Google Play
- [ ] > 1000 beta testers before public launch
- [ ] > 99.9% uptime in production
- [ ] < 1 second p95 page load time

### Phase 18 (Post-Launch)

- [ ] > 50% month-over-month user growth
- [ ] > 40% monthly active user retention
- [ ] > 30 NPS score
- [ ] < $10 customer acquisition cost

---

## Risk Management

### Technical Risks

- **Plaid API changes**: Monitor Plaid changelog, maintain adapter layer
- **Database performance**: Index optimization, read replicas, query monitoring
- **Third-party service outages**: Graceful degradation, status page, retries
- **Security vulnerabilities**: Regular audits, dependency scanning, bug bounty

### Business Risks

- **Low user adoption**: User research, MVP validation, iterative feedback
- **High churn rate**: Onboarding optimization, feature engagement tracking
- **Competitive pressure**: Differentiation through API-first approach, developer tools
- **Regulatory compliance**: Legal counsel, GDPR/CCPA compliance, data residency

### Operational Risks

- **Team capacity**: Prioritize ruthlessly, defer non-critical features
- **Technical debt**: Allocate 20% of time to refactoring and improvements
- **Burnout**: Sustainable pace, clear scope, celebrate milestones
- **Scope creep**: Strict phase boundaries, defer enhancements to later phases

---

## Dependencies & Blockers

### External Dependencies

- **Plaid account**: Required for Phase 4 (bank connections)
- **Stripe account**: Required for Phase 7 (billing)
- **Upstash account**: Required for Phase 5 (background jobs) - ✅ Already configured for rate limiting
- **Neon database**: Required for all phases - ✅ Already set up
- **Email service**: Required for Phase 14 (notifications)
- **Apple Developer account**: Required for Phase 15 (iOS app)
- **Google Play Developer account**: Required for Phase 15 (Android app)

### Internal Blockers

- **Phase 2 must complete before Phase 3**: API keys require user authentication
- **Phase 4 must complete before Phase 5**: Transaction sync requires bank connections
- **Phase 6 can run parallel to Phase 7**: Workspaces and billing are independent
- **Phase 11 should complete before Phase 15**: Mobile app benefits from generated SDK
- **Phase 12-13 should complete before Phase 17**: Observability and security required for launch

---

## Revision History

| Date       | Version | Changes              | Author |
| ---------- | ------- | -------------------- | ------ |
| 2025-01-XX | 1.0     | Initial project plan | Kiro   |

---

## Next Steps

1. **Start Phase 3** (API Key Management) - **RECOMMENDED NEXT STEP**

   - Create spec directory: `.kiro/specs/api-key-management/`
   - Write requirements document (PAT generation, scopes, CRUD operations)
   - Design token hashing strategy (SHA-256) and database schema
   - Define API endpoints and Zod schemas
   - Plan token lifecycle (creation, usage tracking, revocation)

2. **Alternative: Set up Plaid account** (if prioritizing bank connections)

   - Register for Plaid developer account
   - Obtain API keys for Sandbox environment
   - Review Plaid documentation and best practices
   - Create Phase 4 spec (Plaid Integration)

3. **Deploy to preview environment** (optional but recommended)
   - Set up Vercel project for API and web client
   - Configure environment variables in Vercel
   - Deploy and test authentication flow in preview environment
   - Verify CORS and cookie behavior across domains

---

**Remember**: This is a living document. Update it as priorities shift, new requirements emerge, or technical constraints change. The goal is to ship value incrementally while maintaining production quality at every step.
