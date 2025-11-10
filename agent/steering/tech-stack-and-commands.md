# Tech Stack & Handy Commands

Quick reference for the main technologies and everyday commands used in SuperBasic Finance.

## 1. Backend stack

- **Runtime:** Node 20+
- **Framework:** Hono (Node adapter; future Edge-capable)
- **Validation & contracts:** Zod → OpenAPI 3.1
- **ORM & DB:** Prisma 6 on Neon Postgres (UUID PKs, `TIMESTAMPTZ`, `BIGINT` cents)
- **Auth:** Auth.js
- **Payments:** Stripe (Checkout, Portal, webhooks)
- **Banking:** Plaid (Link + server-side token exchange)
- **Background jobs:** Upstash Redis / QStash + Vercel Cron
- **Testing:** Vitest (unit/integration)

## 2. Frontend stack

- **Build tool:** Vite
- **UI:** React 19 + Tailwind
- **Routing:** React Router
- **Data fetching:** TanStack Query
- **Packaging:** SPA designed to be **Capacitor-ready** for mobile.

## 3. Tooling

- **Package manager:** pnpm workspaces
- **Monorepo:** Turborepo
- **Lint/format:** Biome and/or ESLint + Prettier (as configured)
- **Bundling:** tsup (for packages)
- **Hooks:** Husky + lint-staged
- **E2E:** Playwright
- **Versioning / releases:** Changesets (planned/optional)

## 4. Common commands

> Adjust `--filter` flags as needed (api, web, etc.).

- Install dependencies:  
  `pnpm install`

- Start dev servers:  
  `pnpm dev`  
  `pnpm dev --filter=api`  
  `pnpm dev --filter=web`

- Build:  
  `pnpm build`  
  `pnpm build --filter=api`

- Tests:  
  `pnpm test`  
  `pnpm test:unit`  
  `pnpm test:e2e`  
  (For agents/non-interactive: `pnpm test -- --run`)

- Lint, typecheck, format:  
  `pnpm lint`  
  `pnpm typecheck`  
  `pnpm format`

- Database (Prisma):  
  `pnpm db:migrate`  
  `pnpm db:generate`  
  `pnpm db:studio`

- API docs and SDK:  
  `pnpm api:docs`  
  `pnpm sdk:generate`

Keep this file as a **lookup**, not a full spec. When making deeper changes, rely on the architecture and steering docs as well.
