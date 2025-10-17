# Design Document

## Overview

This design establishes the foundational structure for the SuperBasic Finance monorepo. The architecture follows a clear separation of concerns: apps consume packages, packages contain reusable logic, and all configuration is centralized at the root. The design prioritizes developer experience with fast feedback loops, type safety, and minimal configuration duplication.

## Architecture

### Monorepo Structure

```
superbasic-finance/
├── .kiro/
│   └── steering/              # AI assistant guidance (already exists)
├── apps/
│   ├── api/                   # Hono API service
│   └── web/                   # Vite + React SPA
├── packages/
│   ├── auth/                  # Auth.js config, PAT utilities, RBAC
│   ├── core/                  # Domain logic (billing, ledgers, limits)
│   ├── database/              # Prisma schema and client
│   ├── design-system/         # Custom React components
│   ├── observability/         # Logging and tracing
│   ├── rate-limit/            # Upstash Redis helpers
│   ├── sdk/                   # Generated OpenAPI client
│   └── types/                 # Shared Zod schemas
├── tooling/
│   ├── ci/                    # GitHub Actions workflows (future)
│   └── scripts/               # Utility scripts (future)
├── .editorconfig
├── .env.example
├── .gitignore
├── .npmrc
├── biome.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
├── tsconfig.json
└── turbo.json
```

### Dependency Flow

```
apps/api → packages/database, packages/types, packages/auth, packages/core, packages/observability, packages/rate-limit
apps/web → packages/sdk, packages/types, packages/design-system
packages/core → packages/database, packages/types
packages/auth → packages/database, packages/types
packages/sdk → packages/types
packages/design-system → (no internal deps)
packages/observability → (no internal deps)
packages/rate-limit → (no internal deps)
```

### Technology Decisions

**Package Manager**: pnpm v9+ for efficient workspace management and strict dependency resolution

**Build Orchestration**: Turborepo for parallel task execution with intelligent caching

**TypeScript**: Strict mode with shared base config, ESM-first module resolution

**Linting/Formatting**: Biome (replaces ESLint + Prettier) for speed and simplicity

**Bundling**: tsup for packages (ESM + CJS output), Vite for web client, native Node for API

**Testing**: Vitest for unit/integration tests, Playwright for E2E tests

## Components and Interfaces

### Root Configuration Files

**package.json**
- Defines workspace root with private: true
- Includes dev dependencies for tooling (Turborepo, Biome, TypeScript, Vitest, Playwright)
- Provides scripts: dev, build, test, lint, typecheck, format
- Uses pnpm workspaces via pnpm-workspace.yaml reference

**pnpm-workspace.yaml**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tooling/*'
```

**turbo.json**
- Pipeline configuration with task dependencies
- Tasks: lint → typecheck → test → build
- Cache configuration for deterministic tasks
- Output directories: dist, .next, build, coverage

**tsconfig.json**
- Base configuration with strict: true
- Module: ESNext, target: ES2022
- Path aliases for @repo/* packages
- Exclude: node_modules, dist, build

**biome.json**
- Linter rules: recommended + React-specific
- Formatter: 2-space indent, single quotes, semicolons, 100 line width
- Files: include src/**, exclude node_modules, dist

**.gitignore**
- node_modules, dist, build, .next, coverage
- .env, .env.local (but not .env.example)
- OS files (.DS_Store, Thumbs.db)
- IDE files (.vscode, .idea)

**.npmrc**
```
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
```

### apps/api

**Purpose**: Hono-based API service serving /v1 JSON endpoints

**Key Files**:
- `package.json`: Dependencies on Hono, Zod, zod-to-openapi, @repo/database, @repo/types, @repo/auth, @repo/core
- `tsconfig.json`: Extends base, includes src/**/*
- `src/index.ts`: Server entry point, starts Hono app on PORT
- `src/app.ts`: Hono app instance with middleware setup
- `src/routes/v1/health.ts`: Health check endpoint
- `.env.example`: PORT, DATABASE_URL, NODE_ENV

**Dependencies**:
```json
{
  "hono": "^4.0.0",
  "@hono/node-server": "^1.0.0",
  "zod": "^3.22.0",
  "@hono/zod-openapi": "^0.9.0",
  "@repo/database": "workspace:*",
  "@repo/types": "workspace:*",
  "@repo/auth": "workspace:*",
  "@repo/core": "workspace:*"
}
```

**Scripts**:
```json
{
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "typecheck": "tsc --noEmit"
}
```

### apps/web

**Purpose**: Vite + React SPA consuming the API

**Key Files**:
- `package.json`: Dependencies on React 19, React Router, TanStack Query, Tailwind, @repo/sdk, @repo/design-system
- `tsconfig.json`: Extends base, includes src/**/*
- `vite.config.ts`: Vite configuration with React plugin
- `tailwind.config.ts`: Tailwind CSS configuration
- `postcss.config.js`: PostCSS with Tailwind
- `index.html`: Entry HTML file
- `src/main.tsx`: React entry point with Router setup
- `src/App.tsx`: Root component with routes
- `src/pages/Home.tsx`: Placeholder home page
- `.env.example`: VITE_API_URL

**Dependencies**:
```json
{
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-router-dom": "^6.20.0",
  "@tanstack/react-query": "^5.0.0",
  "@repo/sdk": "workspace:*",
  "@repo/design-system": "workspace:*",
  "@repo/types": "workspace:*"
}
```

**Scripts**:
```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit"
}
```

### packages/database

**Purpose**: Prisma schema and client exports

**Key Files**:
- `package.json`: Dependencies on Prisma, @prisma/client
- `schema.prisma`: Datasource (Postgres), generator (client), basic User model
- `src/index.ts`: Re-exports PrismaClient
- `.env.example`: DATABASE_URL

**Schema Structure**:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/client"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Scripts**:
```json
{
  "generate": "prisma generate",
  "migrate": "prisma migrate dev",
  "studio": "prisma studio",
  "build": "prisma generate"
}
```

### packages/types

**Purpose**: Shared Zod schemas for API contracts

**Key Files**:
- `package.json`: Dependencies on Zod
- `src/index.ts`: Exports all schemas
- `src/user.schema.ts`: Example user schemas

**Example Schema**:
```typescript
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;
```

**Scripts**:
```json
{
  "build": "tsup",
  "typecheck": "tsc --noEmit"
}
```

### packages/auth

**Purpose**: Auth.js configuration, PAT utilities, RBAC definitions

**Key Files**:
- `package.json`: Dependencies on @auth/core, bcrypt
- `src/index.ts`: Exports auth utilities
- `src/rbac.ts`: RBAC scope definitions (placeholder)
- `src/pat.ts`: PAT hashing utilities (placeholder)

**Scripts**:
```json
{
  "build": "tsup",
  "typecheck": "tsc --noEmit"
}
```

### packages/core

**Purpose**: Domain logic (billing, ledgers, limits)

**Key Files**:
- `package.json`: Dependencies on @repo/database, @repo/types
- `src/index.ts`: Exports domain services
- `src/billing/`: Billing logic (placeholder)
- `src/ledger/`: Ledger logic (placeholder)

**Scripts**:
```json
{
  "build": "tsup",
  "typecheck": "tsc --noEmit",
  "test": "vitest"
}
```

### packages/sdk

**Purpose**: Generated OpenAPI client (placeholder for now)

**Key Files**:
- `package.json`: Dependencies on @repo/types
- `src/index.ts`: Placeholder SDK exports
- `README.md`: Note that this will be generated from OpenAPI spec

**Scripts**:
```json
{
  "build": "tsup",
  "typecheck": "tsc --noEmit"
}
```

### packages/observability

**Purpose**: Logging and tracing utilities

**Key Files**:
- `package.json`: Dependencies on pino (planned)
- `src/index.ts`: Logger exports (placeholder)
- `src/logger.ts`: Logger configuration (placeholder)

**Scripts**:
```json
{
  "build": "tsup",
  "typecheck": "tsc --noEmit"
}
```

### packages/rate-limit

**Purpose**: Upstash Redis helpers for rate limiting

**Key Files**:
- `package.json`: Dependencies on @upstash/redis (planned)
- `src/index.ts`: Rate limit utilities (placeholder)

**Scripts**:
```json
{
  "build": "tsup",
  "typecheck": "tsc --noEmit"
}
```

### packages/design-system

**Purpose**: Custom React components built with Tailwind CSS

**Key Files**:
- `package.json`: Dependencies on React, Tailwind
- `src/index.ts`: Component exports
- `src/Button.tsx`: Example button component
- `tailwind.config.ts`: Tailwind configuration

**Scripts**:
```json
{
  "build": "tsup",
  "typecheck": "tsc --noEmit"
}
```

## Data Models

### Package Configuration Pattern

All packages follow a consistent structure:

```json
{
  "name": "@repo/package-name",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  }
}
```

### tsup Configuration Pattern

All packages use a shared tsup configuration:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

## Error Handling

### Build Errors

- TypeScript errors fail the build immediately
- Biome linting errors fail CI but can be auto-fixed locally
- Missing dependencies are caught by pnpm's strict resolution

### Development Errors

- Hot reload in API (tsx watch) and web (Vite HMR)
- Type errors shown in editor with TypeScript language server
- Runtime errors logged to console with stack traces

## Testing Strategy

### Unit Tests (Vitest)

- Located in packages/core, packages/auth
- Test domain logic in isolation
- Mock external dependencies (database, APIs)
- Run with `pnpm test:unit`

### Integration Tests (Vitest)

- Located in apps/api
- Test API endpoints with real database (test instance)
- Use supertest or similar for HTTP testing
- Run with `pnpm test` (includes unit tests)

### E2E Tests (Playwright)

- Located in apps/web
- Test critical user flows in real browser
- Run against local dev environment
- Run with `pnpm test:e2e`

### Test Configuration

**vitest.config.ts** (root):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

**playwright.config.ts** (apps/web):
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'pnpm dev',
    port: 5173,
  },
});
```

## Implementation Notes

### Installation Order

1. Initialize root package.json and install tooling dependencies
2. Create pnpm-workspace.yaml and configuration files
3. Create all package directories with package.json files
4. Run `pnpm install` to link workspaces
5. Create source files and configurations
6. Run `pnpm build` to verify everything compiles

### Development Workflow

1. `pnpm install` - Install all dependencies
2. `pnpm db:generate` - Generate Prisma client
3. `pnpm dev` - Start all apps in development mode
4. Make changes, see hot reload
5. `pnpm lint` - Check for linting issues
6. `pnpm typecheck` - Verify types
7. `pnpm test` - Run tests
8. `pnpm build` - Build for production

### Key Principles

- **Convention over configuration**: Use standard file names and locations
- **Type safety**: Everything is typed, from DB to API to UI
- **Fast feedback**: Hot reload, incremental builds, cached tasks
- **Minimal duplication**: Shared configs, reusable packages
- **Production-ready**: Proper error handling, logging, testing from day one
