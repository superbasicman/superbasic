# SuperBasic Finance - Gemini Context

This document provides context and guidelines for Gemini agents working on the SuperBasic Finance project.

## 1. Project Overview

SuperBasic Finance is an **API-first personal finance platform** built as a monorepo. It features a robust JSON API, a thin React SPA web client, and a React Native mobile app.

*   **Philosophy:** "Thin Client" - The frontend (web/mobile) contains minimal business logic and exclusively consumes the public API.
*   **Current Status:** Phase 3.5 (Architecture Refactor). Moving towards a strict Service/Repository pattern and a full OAuth 2.1/OIDC authorization server.
*   **Monorepo Tooling:** pnpm workspaces + Turborepo.

## 2. Architecture & Organization

### Directory Structure

*   `apps/`
    *   `api/`: Hono server on Node.js. Exposes `/v1` routes.
    *   `web/`: React 19 SPA (Vite).
    *   `mobile/`: React Native (Expo) app.
*   `packages/`
    *   `core/`: **Domain Business Logic**. Pure functions, services, and repositories.
    *   `database/`: Prisma schema, migrations, and client.
    *   `auth-core/`: OAuth 2.1 authorization logic and token management.
    *   `types/`: Shared Zod schemas and types.
    *   `design-system/`: Shared UI components (React + Tailwind).
*   `agent/steering/`: **Critical Documentation**. Contains architectural decisions and patterns.

### The 3-Layer Architecture Pattern

We enforce a strict separation of concerns for API features:

1.  **HTTP Layer (`apps/api/src/routes/`)**
    *   **Role:** Controller.
    *   **Responsibility:** Parse request -> Validate (Zod) -> Call Service -> Format Response.
    *   **Constraint:** Keep thin (< 30 lines). No business logic.
2.  **Service Layer (`packages/core/src/{domain}/`)**
    *   **Role:** Business Logic.
    *   **Responsibility:** Implement rules, orchestrate repositories, emit events.
    *   **Constraint:** Pure TypeScript classes. Returns Domain Objects (not HTTP responses).
3.  **Repository Layer (`packages/core/src/{domain}/`)**
    *   **Role:** Data Access.
    *   **Responsibility:** Pure Prisma CRUD operations.
    *   **Constraint:** No business logic. Returns Database Entities.

### Authentication

*   **Strategy:** Moving towards OAuth 2.1/OIDC.
*   **Components:** `packages/auth-core` handles token issuance/validation.
*   **Tokens:**
    *   **Access Tokens:** Short-lived JWTs.
    *   **Refresh Tokens:** Long-lived, rotated, stored as hash envelopes.
    *   **PATs:** Personal Access Tokens for external API usage.

## 3. Technology Stack

### Backend
*   **Runtime:** Node.js 20+
*   **Framework:** Hono 4
*   **Database:** PostgreSQL (Neon) with Prisma 6
*   **Auth:** Auth.js, Custom OAuth 2.1 implementation
*   **Caching/Rate Limit:** Upstash Redis
*   **Validation:** Zod

### Frontend
*   **Web:** React 19, Vite, TanStack Query, React Router, Tailwind CSS
*   **Mobile:** React Native, Expo, NativeWind

### Tooling
*   **Linting/Formatting:** Biome (`pnpm format`, `pnpm lint`)
*   **Testing:** Vitest (Unit/Integration), Playwright (Web E2E), Detox (Mobile E2E)
*   **Build:** Turborepo, tsup

## 4. Key Workflows & Commands

**Note:** Use `--filter` to target specific apps/packages (e.g., `--filter=api`, `--filter=@repo/core`).

### Development
*   **Start All:** `pnpm dev`
*   **Start API:** `pnpm dev --filter=api`
*   **Start Web:** `pnpm dev --filter=web`
*   **Start Mobile:** `pnpm dev --filter=mobile`
*   **Setup Env:** `pnpm setup:env` (Interactive wizard)

### Database (Prisma)
*   **Generate Client:** `pnpm db:generate` (Run after schema changes)
*   **Migrate (Local):** `pnpm db:migrate --target local`
*   **Studio:** `pnpm db:studio`
*   **Seed:** `pnpm db:seed`

### Testing
*   **Unit/Integration:** `pnpm test` (Runs Vitest)
*   **E2E (Web):** `pnpm test:e2e` (Runs Playwright)
*   **Watch Mode:** `pnpm test:watch`

### Code Quality
*   **Lint & Typecheck:** `pnpm lint && pnpm typecheck`
*   **Format:** `pnpm format` (Uses Biome)

## 5. Development Guidelines

1.  **API First:** Always define the API contract (Zod schema) before implementing the UI.
2.  **No Direct DB in Clients:** `apps/web` and `apps/mobile` must **never** import `@repo/database` or `prisma`. They must use the JSON API.
3.  **Strict Typing:** Use strict TypeScript. Avoid `any`. Share types via `@repo/types`.
4.  **Testing:**
    *   Write **Unit Tests** for Services (mock repositories).
    *   Write **Integration Tests** for API Routes (use real DB in `.env.test`).
5.  **Secrets:** Never commit `.env` files. Use the `setup:env` script or secure storage.
6.  **Agent Resources:** Refer to `agent/steering/` for deep dives into specific topics (e.g., `architecture-overview.md`, `auth-migration/`).

## 6. Common Pitfalls to Avoid

*   ❌ **Anti-Pattern:** Importing `PrismaClient` directly in a Route Handler.
    *   ✅ **Fix:** Inject a Repository into a Service, and call the Service.
*   ❌ **Anti-Pattern:** Putting business logic in a Repository.
    *   ✅ **Fix:** Move it to the Service layer. Repositories are for CRUD only.
*   ❌ **Anti-Pattern:** formatting code with Prettier.
    *   ✅ **Fix:** Use `pnpm format` (Biome).
