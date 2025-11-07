# API Contracts & Versioning

## API Contracts

- Use Zod schemas for every handler input/output; derive TypeScript types and OpenAPI spec from them.
- Snapshot OpenAPI output in CI and review diffs on PRs.
- Version routes under `/v1`; only non-breaking additions are allowed within the same version.
- Treat OpenAPI as the source of truth for the public surface area; keep it in sync with implementation.
