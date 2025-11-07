# Architecture Overview & Organization

## Organization Principles

- Keep domain logic in `packages/core` and surface it via pure functions; apps consume only those APIs.
- Restrict `apps/web` to SDK/API calls—lint or CI should fail on direct DB imports.
- Favor composable Hono middlewares for CORS, rate limits, and auth; avoid bespoke wrappers unless necessary.
- Centralize secret parsing in server-only modules (`apps/api`, `packages/auth`, etc.); never surface secrets in `apps/web` or anything shipped to the browser.

## Layered Architecture Pattern (Target State)

Follow a strict three-layer architecture for API features:

```
┌─────────────────────────────────────────────────────────┐
│ apps/api/src/routes/v1/                                 │
│ HTTP LAYER (Controllers)                                │
│ - Parse/validate HTTP requests                          │
│ - Call service layer methods                            │
│ - Format HTTP responses                                 │
│ - Handle HTTP-specific errors (4xx, 5xx)               │
│ - Apply middleware (auth, rate limits, validation)     │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ BUSINESS LOGIC LAYER (Services)                        │
│ - Implement business rules and workflows               │
│ - Orchestrate multiple repository calls                │
│ - Validate business constraints                        │
│ - Emit domain events for audit logging                 │
│ - Return domain objects (not HTTP responses)           │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ packages/core/src/{domain}/                            │
│ DATA ACCESS LAYER (Repositories)                       │
│ - Pure Prisma operations (CRUD only)                   │
│ - No business logic or validation                      │
│ - Return database entities                             │
│ - Handle database-specific errors                      │
└─────────────────────────────────────────────────────────┘
```

## Single Responsibility Principle (SRP)

**Each function should have ONE clear responsibility:**

- **Route handlers**: Parse request → Call service → Format response
- **Services**: Implement ONE business operation (e.g. `createToken`, `syncTransactions`, `calculateBudget`)
- **Repositories**: Perform ONE database operation (`findById`, `create`, `update`, `delete`)
- **Utilities**: Perform ONE pure function (`hashToken`, `formatCurrency`, `validateEmail`)

**Keep functions focused and short:**

- Aim for functions under ~50 lines (ideally 20–30).
- If a function does multiple things, extract helper functions.
- Use early returns to reduce nesting.
- Extract complex conditionals into named boolean helpers.

## When to Deviate from This Pattern

**For new features ask: “Will this need business logic later?”**

- If **yes**, use the full layered pattern from the start.
- If **no**, keep it simple but document the decision and rationale.
