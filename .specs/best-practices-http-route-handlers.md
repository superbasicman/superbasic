# HTTP Route Handler Pattern (Hono / API Layer)

## Route Handler Pattern (HTTP Layer)

**Route handlers should be thin controllers:**

```typescript
// ✅ GOOD - Thin controller
export const createTokenRoute = new Hono<AuthContext>();

createTokenRoute.post(
  "/",
  authMiddleware,
  rateLimitMiddleware,
  zValidator("json", CreateTokenSchema),
  async (c) => {
    const userId = c.get("userId");
    const profileId = c.get("profileId");
    const data = c.req.valid("json");

    try {
      // Call service layer - business logic lives there
      const result = await tokenService.createToken({
        userId,
        profileId,
        ...data,
      });

      // Format HTTP response
      return c.json(result, 201);
    } catch (error) {
      // Handle domain errors → HTTP errors
      if (error instanceof DuplicateTokenNameError) {
        return c.json({ error: error.message }, 409);
      }
      if (error instanceof InvalidScopesError) {
        return c.json({ error: error.message }, 400);
      }
      throw error; // Let global error handler catch unexpected errors
    }
  }
);
```

```typescript
// ❌ BAD - Fat controller with business logic and DB access
createTokenRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const { name, scopes, expiresInDays } = await c.req.json();

  // ❌ Validation in controller
  if (!validateScopes(scopes)) {
    return c.json({ error: "Invalid scopes" }, 400);
  }

  // ❌ Database access in controller
  const existing = await prisma.apiKey.findUnique({
    where: { userId_name: { userId, name } },
  });

  if (existing) {
    return c.json({ error: "Duplicate name" }, 409);
  }

  // ❌ Business logic in controller
  const token = generateToken();
  const keyHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  // ❌ More database access
  const apiKey = await prisma.apiKey.create({
    data: { userId, name, keyHash, scopes, expiresAt },
  });

  return c.json({ token, ...apiKey }, 201);
});
```

**Controller responsibilities recap:**

- Parse/validate HTTP input (with Zod validators).
- Pull context values (`userId`, `profileId`, `workspaceId`, `requestId`).
- Call a service method.
- Map domain errors → HTTP status codes.
- Format the HTTP response body and status code.
