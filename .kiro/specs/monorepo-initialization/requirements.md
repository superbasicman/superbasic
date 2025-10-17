# Requirements Document

## Introduction

This specification covers the initial setup of the SuperBasic Finance monorepo, including workspace configuration, package structure, tooling setup, and skeleton implementations for all apps and packages. The goal is to establish a production-ready foundation that follows our architectural principles: API-first, thin client, secure by design, and operationally simple.

## Glossary

- **Monorepo**: A single repository containing multiple packages and applications managed by pnpm workspaces and Turborepo
- **API Service**: The Hono-based backend application serving /v1 JSON endpoints
- **Web Client**: The Vite + React SPA that consumes the API
- **Workspace Package**: A shared package in the monorepo (e.g., @repo/database, @repo/types)
- **Turborepo**: Build orchestration tool that manages task dependencies and caching
- **Biome**: Fast linter and formatter for TypeScript/JavaScript
- **Prisma**: ORM and migration tool for Postgres database access
- **OpenAPI**: API specification standard for documenting REST endpoints

## Requirements

### Requirement 1

**User Story:** As a developer, I want a properly configured pnpm monorepo, so that I can manage multiple packages with shared dependencies efficiently.

#### Acceptance Criteria

1. WHEN the repository is initialized, THE Monorepo SHALL contain a root package.json with pnpm workspace configuration
2. THE Monorepo SHALL define workspace packages in pnpm-workspace.yaml covering apps/* and packages/*
3. THE Monorepo SHALL use pnpm version 9 or higher for workspace management
4. THE Monorepo SHALL include a root .npmrc file with appropriate pnpm settings
5. WHEN dependencies are installed, THE Monorepo SHALL create a single pnpm-lock.yaml at the root

### Requirement 2

**User Story:** As a developer, I want Turborepo configured for build orchestration, so that tasks run in the correct order with caching enabled.

#### Acceptance Criteria

1. THE Monorepo SHALL include a turbo.json configuration file at the root
2. THE Turborepo Configuration SHALL define pipeline tasks for lint, typecheck, test, build, and dev
3. THE Turborepo Configuration SHALL specify task dependencies ensuring lint runs before typecheck and typecheck runs before build
4. THE Turborepo Configuration SHALL enable caching for deterministic tasks (lint, typecheck, test, build)
5. THE Turborepo Configuration SHALL configure outputs for each task type

### Requirement 3

**User Story:** As a developer, I want TypeScript configured consistently across all packages, so that type checking works correctly in the monorepo.

#### Acceptance Criteria

1. THE Monorepo SHALL include a base tsconfig.json at the root with strict mode enabled
2. WHEN a package is created, THE Package SHALL extend the base tsconfig.json
3. THE TypeScript Configuration SHALL use ESM module resolution (bundler or node16)
4. THE TypeScript Configuration SHALL enable strict type checking flags
5. THE TypeScript Configuration SHALL configure path aliases for workspace packages

### Requirement 4

**User Story:** As a developer, I want Biome configured for linting and formatting, so that code style is consistent across the codebase.

#### Acceptance Criteria

1. THE Monorepo SHALL include a biome.json configuration file at the root
2. THE Biome Configuration SHALL define linting rules appropriate for TypeScript and React
3. THE Biome Configuration SHALL define formatting rules (indentation, quotes, semicolons, line width)
4. THE Biome Configuration SHALL configure file patterns to include and exclude
5. THE Monorepo SHALL include lint and format scripts in the root package.json

### Requirement 5

**User Story:** As a developer, I want the API service skeleton created, so that I can start building /v1 endpoints.

#### Acceptance Criteria

1. THE Monorepo SHALL include an apps/api directory with proper package.json
2. THE API Service SHALL use Hono 4 framework with Node adapter
3. THE API Service SHALL include a basic server entry point that starts on a configurable port
4. THE API Service SHALL include a /v1 route prefix structure
5. THE API Service SHALL include Zod and zod-to-openapi dependencies for schema validation
6. THE API Service SHALL include a health check endpoint at /v1/health
7. THE API Service SHALL include TypeScript configuration extending the base config

### Requirement 6

**User Story:** As a developer, I want the web client skeleton created, so that I can start building the dashboard UI.

#### Acceptance Criteria

1. THE Monorepo SHALL include an apps/web directory with proper package.json
2. THE Web Client SHALL use Vite as the build tool with React 19
3. THE Web Client SHALL include React Router for client-side routing
4. THE Web Client SHALL include Tailwind CSS configuration
5. THE Web Client SHALL include a basic index.html and main entry point
6. THE Web Client SHALL include a placeholder home page component
7. THE Web Client SHALL include TypeScript configuration extending the base config

### Requirement 7

**User Story:** As a developer, I want shared workspace packages created, so that code can be shared between apps.

#### Acceptance Criteria

1. THE Monorepo SHALL include packages/database with Prisma configuration
2. THE Monorepo SHALL include packages/types for shared Zod schemas
3. THE Monorepo SHALL include packages/auth for authentication utilities
4. THE Monorepo SHALL include packages/core for domain logic
5. THE Monorepo SHALL include packages/sdk for the generated API client
6. THE Monorepo SHALL include packages/observability for logging utilities
7. THE Monorepo SHALL include packages/rate-limit for Upstash helpers
8. THE Monorepo SHALL include packages/design-system for shared React components
9. WHEN a package is created, THE Package SHALL have a proper package.json with name, version, and exports

### Requirement 8

**User Story:** As a developer, I want Prisma configured with a basic schema, so that I can start defining database models.

#### Acceptance Criteria

1. THE Database Package SHALL include a schema.prisma file with Postgres datasource
2. THE Database Package SHALL include a basic User model in the schema
3. THE Database Package SHALL include scripts for generate, migrate, and studio commands
4. THE Database Package SHALL export the Prisma client for use in other packages
5. THE Database Package SHALL include a .env.example file documenting DATABASE_URL

### Requirement 9

**User Story:** As a developer, I want development scripts configured, so that I can run the entire stack locally.

#### Acceptance Criteria

1. THE Root Package SHALL include a dev script that starts all apps in development mode
2. THE Root Package SHALL include a build script that builds all packages and apps
3. THE Root Package SHALL include a test script that runs all tests
4. THE Root Package SHALL include lint, typecheck, and format scripts
5. THE API Service SHALL include a dev script using tsx watch or similar for hot reload
6. THE Web Client SHALL include a dev script using Vite dev server

### Requirement 10

**User Story:** As a developer, I want Git and editor configuration files, so that the development environment is consistent.

#### Acceptance Criteria

1. THE Monorepo SHALL include a .gitignore file covering node_modules, dist, .env, and build artifacts
2. THE Monorepo SHALL include an .editorconfig file for consistent editor settings
3. THE Monorepo SHALL include a .env.example file at the root documenting required environment variables
4. THE Monorepo SHALL include a README.md with setup instructions and common commands
5. WHEN Husky is configured, THE Monorepo SHALL include pre-commit hooks for lint-staged

### Requirement 11

**User Story:** As a developer, I want package bundling configured, so that shared packages can be built and consumed correctly.

#### Acceptance Criteria

1. THE Shared Packages SHALL use tsup for bundling TypeScript to ESM and CJS
2. WHEN a package is built, THE Package SHALL output to a dist directory
3. THE Package Configuration SHALL define proper entry points in package.json exports field
4. THE Package Configuration SHALL include a build script using tsup
5. THE Turborepo Configuration SHALL ensure packages build before apps that depend on them

### Requirement 12

**User Story:** As a developer, I want testing infrastructure configured, so that I can write and run tests.

#### Acceptance Criteria

1. THE Monorepo SHALL include Vitest as the test runner
2. THE Root Package SHALL include a vitest.config.ts or workspace configuration
3. THE Packages SHALL include test scripts that run Vitest
4. THE Monorepo SHALL include Playwright for E2E testing
5. THE Web Client SHALL include a playwright.config.ts for E2E test configuration
