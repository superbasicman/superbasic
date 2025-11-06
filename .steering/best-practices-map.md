# Best Practices Map

Use this file from `agents.md` to decide which best-practices files to include for a given task.

- **best-practices-planning-and-overview.md**  
  High-level guidelines and planning habits. Include for *any* non-trivial feature, refactor, or cross-cutting change.

- **best-practices-architecture-overview.md**  
  Organization principles, layered architecture, and SRP. Include when designing or refactoring how a feature fits into `apps/api` vs `packages/core`, or when deciding where logic should live.

- **best-practices-http-route-handlers.md**  
  Hono route handler pattern, good vs bad controller examples. Include when adding or modifying API routes in `apps/api/src/routes`.

- **best-practices-services-repositories-and-di.md**  
  Service-layer pattern, repository pattern, and dependency injection examples. Include when adding/modifying services, repositories, or shared service wiring.

- **best-practices-domain-errors-and-package-structure.md**  
  Domain error patterns and recommended `packages/core` folder layout. Include when introducing new domains, reorganizing `packages/core`, or adding domain-specific error types.

- **best-practices-code-quality.md**  
  General code-style and structure rules. Safe to include for almost any coding task when you want quality guardrails.

- **best-practices-security-and-secrets.md**
  Security, auth, and secrets management rules. Include for auth/billing/webhook work, anything involving tokens/keys, or when handling environment variables and `.env` files.

- **best-practices-api-contracts.md**  
  Zod/OpenAPI contract rules and versioning. Include for work on public endpoints, SDKs, or any change that affects request/response shapes.

- **best-practices-background-workflows.md**  
  QStash usage and background sync patterns. Include for Plaid integrations, cron-like tasks, or any async/offline processing.

- **best-practices-testing-observability-and-ops.md**  
  Testing strategy by layer, release checks, observability, and ops hygiene. Include when adding tests, preparing releases, debugging production-ish issues, or changing CI/CD/monitoring.

- **best-practices-git-and-culture.md**  
  Git safety rules for agents plus team culture notes. Include for meta/maintenance tasks, or whenever there’s a risk an agent might try to manipulate git.
