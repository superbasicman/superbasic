# @repo/sdk

TypeScript SDK for the SuperBasic Finance API.

## Status

⚠️ **This package is currently a placeholder.** The SDK will be auto-generated from the OpenAPI specification once the API is implemented.

## Future Generation

This SDK will be generated using one of the following tools:

- **openapi-typescript-codegen** - Generates TypeScript clients from OpenAPI 3.x specs
- **@hey-api/openapi-ts** - Modern OpenAPI TypeScript generator
- **orval** - OpenAPI client generator with React Query support

The generation process will be triggered by:

```bash
# Generate OpenAPI spec from API
pnpm api:docs

# Generate SDK from OpenAPI spec
pnpm sdk:generate
```

## Planned Usage

Once generated, the SDK will provide type-safe access to all /v1 API endpoints:

```typescript
import { SuperBasicSDK } from '@repo/sdk';

const client = new SuperBasicSDK({
  baseUrl: 'https://api.superbasic.finance',
  apiKey: 'your-api-key',
});

// Type-safe API calls
const user = await client.users.getMe();
const accounts = await client.plaid.listAccounts();
```

## Development

```bash
# Build the package
pnpm build

# Type check
pnpm typecheck
```

## Dependencies

- `@repo/types` - Shared Zod schemas for request/response validation
