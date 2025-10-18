# User vs Profile Reference Strategy

**Status**: ✅ Implemented  
**Date**: 2025-10-17  
**Phase**: Phase 2 Completion

## Overview

This document explains the separation between `users` (Auth.js identity) and `profiles` (user preferences/business data), and how the codebase references each.

## The Split

### Users Table (Auth.js Identity)

- **Purpose**: Authentication and identity management
- **Managed by**: Auth.js Prisma adapter
- **Contains**: email, password hash, OAuth accounts, sessions
- **Referenced by**: Authentication-related tables only

### Profiles Table (Business Data)

- **Purpose**: User preferences and business logic ownership
- **Managed by**: Application code
- **Contains**: timezone, currency, settings (JSONB)
- **Referenced by**: All business logic tables (connections, workspaces, budgets, etc.)

## Reference Rules

### When to use `users.id`

Use `users.id` for **authentication concerns**:

- `api_keys` table (PATs are authentication credentials)
- `sessions` table (Auth.js managed)
- `accounts` table (OAuth providers, Auth.js managed)
- JWT payload (`sub` claim)

### When to use `profiles.id`

Use `profiles.id` for **business logic**:

- `connections` table (Plaid bank connections)
- `workspaces` table (collaboration spaces)
- `budget_plans` table (user budgets)
- `transactions` table (via connections)
- Any domain-specific user data

## Middleware Implementation

The auth middleware (`apps/api/src/middleware/auth.ts`) attaches both IDs to the request context:

```typescript
// After JWT validation
c.set("userId", decoded.id as string); // For authentication
c.set("userEmail", decoded.email as string);
c.set("jti", decoded.jti as string);

// Fetch and attach profile
const profile = await prisma.profile.findUnique({
  where: { userId: decoded.id as string },
  select: { id: true },
});

if (profile) {
  c.set("profileId", profile.id); // For business logic
}
```

## Context Type Definition

Shared type in `apps/api/src/types/context.ts`:

```typescript
export type AuthContext = {
  Variables: {
    userId: string; // Auth.js user ID
    userEmail: string;
    jti: string; // JWT ID
    profileId?: string; // Profile ID (optional, might not exist yet)
  };
};
```

## Usage in Route Handlers

```typescript
import type { AuthContext } from "../../types/context.js";

const myRoute = new Hono<AuthContext>();

myRoute.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId"); // For auth-related operations
  const profileId = c.get("profileId"); // For business logic

  // Example: Create API key (auth concern, uses userId)
  await prisma.apiKey.create({
    data: {
      userId, // ← Auth concern
      name: "My API Key",
      keyHash: "...",
    },
  });

  // Example: Create connection (business logic, uses profileId)
  await prisma.connection.create({
    data: {
      ownerProfileId: profileId, // ← Business logic
      provider: "plaid",
      providerItemId: "...",
    },
  });
});
```

## Migration Path

### Existing Code

- JWT payload contains `users.id` (no change needed)
- Auth middleware validates JWT and extracts `userId`
- Routes use `userId` for authentication checks

### New Code (Phase 3+)

- Auth middleware now also fetches and attaches `profileId`
- New routes should use `profileId` for business logic
- Authentication-related operations continue using `userId`

### Backward Compatibility

- Existing routes continue working (they only use `userId`)
- New routes can access both `userId` and `profileId`
- No breaking changes to existing functionality

## Phase 3 Implications (API Key Management)

The `api_keys` table will reference `users.id` because:

1. PATs are authentication credentials (like passwords)
2. They authenticate requests on behalf of a user
3. They're managed by Auth.js-adjacent logic
4. They need to work even if profile preferences change

From Phase 3 requirements:

> "THE Authentication System SHALL store token hashes in a dedicated `api_keys` table with columns for hash, **user_id**, name, scopes..."

## Phase 4+ Implications (Plaid Integration)

The `connections` table will reference `profiles.id` because:

1. Bank connections are user data, not identity
2. They represent business logic ownership
3. They may be shared across workspaces (future)
4. They're tied to user preferences (currency, timezone)

## Benefits

1. **Clear separation of concerns**: Auth vs business logic
2. **Future-proof**: Workspaces can reference profiles, not users
3. **Flexibility**: User can change email without affecting business data
4. **Security**: Authentication credentials isolated from business data
5. **Scalability**: Profiles can be extended without touching Auth.js schema

## Testing

- ✅ Middleware attaches both `userId` and `profileId`
- ✅ `/me` endpoint returns both user and profile data
- ✅ Type checking passes with shared `AuthContext` type
- ✅ Pattern documented in `best-practices.md` steering file

## Next Steps

1. Phase 3 will implement `api_keys` table referencing `users.id`
2. Phase 4 will implement `connections` table referencing `profiles.id`
3. All future business logic tables should reference `profiles.id`
4. Update database schema documentation with this pattern
