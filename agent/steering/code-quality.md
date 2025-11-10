# Code Quality & Implementation Guardrails

These habits keep SuperBasic code readable, predictable, and easy to change.

## 1. General principles

- Prefer clarity over cleverness: name things after their domain concepts and delete ambiguous abbreviations.
- Keep functions focused: if a function handles parsing, validation, and persistence, break it into helpers.
- Default to pure functions for business logic; isolate side effects (I/O, logging, metrics) so they are easy to test.
- Lean on TypeScript’s types and Zod schemas instead of runtime checks scattered through code.

## 2. Implementation habits

- Respect the three-layer architecture: routes → services → repositories. Crossing layers is a last resort and must be documented.
- Avoid deep nesting; use early returns and guard clauses for error paths.
- Prefer composition over inheritance—small utilities wired together beat fragile base classes.
- Keep modules under ~200 lines. Split files when a domain concept expands.
- Comment only when intent is non-obvious (for example, describing a gnarly RLS workaround). Do not comment obvious assignments or control flow.

## 3. Error handling & observability

- Translate domain errors to HTTP responses in handlers; never leak raw Prisma or provider errors to clients.
- Use structured logging helpers so every log includes `requestId`, `userId`, `profileId`, and `workspaceId` when available.
- When catching an error, either handle it fully or rethrow; never swallow errors silently.
- Guard against partial writes by wrapping multi-step mutations in services with transactions.

## 4. Testing expectations

- Add the smallest useful test at the layer where the change lives:
  - Repositories → unit tests against Prisma test DB or mocks.
  - Services → unit tests with repository fakes.
  - Routes → API/Vitest integration tests.
- For bug fixes, add a regression test that fails before the fix and passes after.
- Keep test data builders next to the domains they model; avoid copy/pasting fixtures across packages.

## 5. Change hygiene

- Update docs/specs alongside code so reviewers don’t need to guess intent.
- When touching public contracts (API, SDK, database), note the change in the relevant doc before coding.
- Prefer multiple small PRs/tasks over one giant drop; call out TODOs that should become future work instead of leaving half-finished ideas in code.
