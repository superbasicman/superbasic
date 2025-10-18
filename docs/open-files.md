# Open Files Reference

This document tracks key files that should be kept in context during development to prevent drift and maintain consistency. Use this as a reference when starting new specs or continuing work on existing features.

## Purpose

- **Prevent drift**: Ensure all relevant files are refreshed after completing tasks
- **Maintain context**: Keep important configuration and implementation files visible
- **Spec consistency**: Reference this list when creating new specs to include relevant files
- **Quick refresh**: Use "refresh all files in open-files.md" to sync context

## Usage

### Starting a New Spec
```
Include files from relevant sections below in your context
```

### After Completing a Task
```
"Refresh all the files in open-files.md to reflect any updates/changes"
```

### During Development
```
Reference this list to ensure you're working with the latest versions
```

---

## Core Configuration Files

### Monorepo & Tooling
- `package.json` - Root package.json with workspace scripts
- `pnpm-workspace.yaml` - Workspace configuration
- `turbo.json` - Turborepo build orchestration
- `tsconfig.json` - Root TypeScript configuration
- `biome.json` - Linting and formatting rules
- `vitest.config.ts` - Test configuration

### Environment & Secrets
- `apps/api/.env.example` - API environment template
- `apps/api/.env.local` - API local development secrets
- `apps/api/.env.test` - API test environment secrets
- `packages/database/.env.local` - Database connection string

---

## Steering Documents (Always Include)

These files provide project-wide context and should be referenced in most specs:

- `.kiro/steering/product.md` - Product overview and principles
- `.kiro/steering/structure.md` - Project structure and conventions
- `.kiro/steering/tech.md` - Technology stack and tooling
- `.kiro/steering/best-practices.md` - Code quality and security guidelines
- `.kiro/steering/database-schema.md` - Complete database schema reference
- `.kiro/steering/task-hygiene.md` - Documentation and artifact management

---

## API Application (apps/api)

### Core API Files
- `apps/api/src/app.ts` - Hono app initialization and middleware
- `apps/api/src/routes/v1/health.ts` - Health check endpoint (example route)

### API Routes (add as implemented)
- `apps/api/src/routes/v1/register.ts` - User registration
- `apps/api/src/routes/v1/login.ts` - User login
- `apps/api/src/routes/v1/logout.ts` - User logout
- `apps/api/src/routes/v1/me.ts` - Session endpoint

### API Middleware
- `apps/api/src/middleware/auth.ts` - Authentication middleware
- `apps/api/src/middleware/cors.ts` - CORS configuration
- `apps/api/src/middleware/rate-limit.ts` - Rate limiting

---

## Web Application (apps/web)

### Core Web Files
- `apps/web/src/pages/Home.tsx` - Home page component
- `apps/web/src/pages/Login.tsx` - Login page
- `apps/web/src/pages/Register.tsx` - Registration page

### Web Context & Providers
- `apps/web/src/contexts/AuthContext.tsx` - Authentication context
- `apps/web/src/lib/api.ts` - API client utilities

---

## Shared Packages

### Authentication (@repo/auth)
- `packages/auth/package.json` - Auth package configuration
- `packages/auth/src/index.ts` - Auth exports
- `packages/auth/src/config.ts` - Auth.js configuration
- `packages/auth/src/password.ts` - Password hashing utilities

### Database (@repo/database)
- `packages/database/prisma/schema.prisma` - Prisma schema
- `packages/database/src/index.ts` - Database client exports

### Rate Limiting (@repo/rate-limit)
- `packages/rate-limit/src/index.ts` - Rate limiting utilities
- `packages/rate-limit/src/sliding-window.ts` - Sliding window implementation

### Types (@repo/types)
- `packages/types/src/index.ts` - Shared type definitions
- `packages/types/src/auth.ts` - Authentication types

---

## Testing Files

### E2E Tests
- `apps/web/e2e/README.md` - E2E testing documentation
- `apps/web/e2e/auth.spec.ts` - Authentication E2E tests
- `apps/web/e2e/run-tests.sh` - E2E test runner script

### Integration Tests
- `apps/api/src/routes/v1/__tests__/register.test.ts`
- `apps/api/src/routes/v1/__tests__/login.test.ts`
- `apps/api/src/routes/v1/__tests__/logout.test.ts`
- `apps/api/src/routes/v1/__tests__/me.test.ts`

---

## Specification Documents

### Phase 1: Monorepo Initialization ✅
- `.kiro/specs/monorepo-initialization/requirements.md`
- `.kiro/specs/monorepo-initialization/design.md`
- `.kiro/specs/monorepo-initialization/tasks.md`

### Phase 2: Authentication Foundation ✅
- `.kiro/specs/authentication-foundation/requirements.md`
- `.kiro/specs/authentication-foundation/design.md`
- `.kiro/specs/authentication-foundation/tasks.md`

### Phase 2: Authentication Testing ✅
- `.kiro/specs/authentication-testing/requirements.md`
- `.kiro/specs/authentication-testing/design.md`
- `.kiro/specs/authentication-testing/tasks.md`

### Phase 3: API Key Management (In Progress)
- `.kiro/specs/api-key-management/requirements.md`
- `.kiro/specs/api-key-management/design.md` (to be created)
- `.kiro/specs/api-key-management/tasks.md` (to be created)

---

## Documentation

### Project Documentation
- `README.md` - Main project README
- `docs/project_plan.md` - Complete project roadmap and phases
- `docs/phase-1-readme.md` - Phase 1 completion summary
- `docs/phase-2-readme.md` - Phase 2 completion summary

### Archived Documentation
- `docs/archived/user-profile-reference-strategy.md` - User/profile reference decisions
- `docs/archived/typescript-errors-fixed.md` - TypeScript error resolution
- `docs/archived/profiles-table-implementation.md` - Profiles table implementation notes
- `docs/rabbit-trail-phase-2.md` - Phase 2 development notes

---

## Utility Scripts

### Database Scripts
- `tooling/scripts/backfill-profiles.ts` - Profile backfill script

### Development Scripts
- `tooling/scripts/dev.sh` - Development server startup (if exists)
- `tooling/scripts/test.sh` - Test runner (if exists)

---

## Phase-Specific File Groups

### When Working on Authentication
```
Steering: product.md, structure.md, best-practices.md, database-schema.md
API: app.ts, routes/v1/{register,login,logout,me}.ts, middleware/auth.ts
Web: pages/{Login,Register,Home}.tsx, contexts/AuthContext.tsx
Packages: auth/*, database/prisma/schema.prisma
Tests: e2e/auth.spec.ts, routes/v1/__tests__/*.test.ts
Specs: authentication-foundation/*, authentication-testing/*
```

### When Working on API Keys (Phase 3)
```
Steering: product.md, structure.md, best-practices.md, database-schema.md
API: app.ts, routes/v1/tokens.ts (to be created), middleware/auth.ts
Web: pages/Settings.tsx (to be created), components/ApiKeyManager.tsx (to be created)
Packages: auth/*, database/prisma/schema.prisma
Specs: api-key-management/*
```

### When Working on Plaid Integration (Phase 4)
```
Steering: product.md, structure.md, best-practices.md, database-schema.md
API: app.ts, routes/v1/plaid/*.ts (to be created)
Web: pages/Connections.tsx (to be created), components/PlaidLink.tsx (to be created)
Packages: database/prisma/schema.prisma
Specs: plaid-bank-connections/*
```

---

## Maintenance Notes

### Adding New Files
When creating new files that should be tracked:
1. Add them to the appropriate section above
2. Include a brief description of their purpose
3. Mark with "(to be created)" if planned but not yet implemented

### Removing Files
When files are deprecated or archived:
1. Move them to the "Archived Documentation" section
2. Add a note explaining why they were archived
3. Keep them in the list for historical reference

### Updating After Task Completion
After completing a task:
1. Review this document
2. Add any new files created during the task
3. Update file statuses (remove "to be created" markers)
4. Refresh all files in your context to prevent drift

---

## Quick Commands

### Refresh All Context
```
"Refresh all the files in open-files.md to reflect any updates/changes"
```

### Refresh Specific Section
```
"Refresh all API files from open-files.md"
"Refresh all steering documents from open-files.md"
"Refresh all Phase 3 files from open-files.md"
```

### Check for Drift
```
"Compare the current state of files in open-files.md with what's in context"
```

---

**Last Updated**: 2025-01-XX (update this date when making changes)
**Current Phase**: Phase 3 - API Key Management
**Next Review**: After Phase 3 completion
