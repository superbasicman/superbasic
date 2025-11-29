# HTTP Route Handler Pattern (Hono / API Layer)

## Route Handler Pattern (HTTP Layer)

**Route handlers should be thin controllers:**

```typescript
// ✅ GOOD - Thin controller
export const createExampleRoute = new Hono<AuthContext>();

createExampleRoute.post(
  "/",
  authMiddleware,
  rateLimitMiddleware,
  zValidator("json", CreateExampleSchema),
  async (c) => {
    const userId = c.get("userId");
    const data = c.req.valid("json");

    try {
      const result = await exampleService.createExample({ userId, ...data });
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof DuplicateNameError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  }
);
```

```typescript
// ❌ BAD - Fat controller with business logic and DB access
createExampleRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const { name } = await c.req.json();

  // ❌ Validation in controller
  if (!name) {
    return c.json({ error: "Invalid name" }, 400);
  }

  // ❌ Database access in controller
  const existing = await prisma.example.findUnique({
    where: { userId_name: { userId, name } },
  });

  if (existing) {
    return c.json({ error: "Duplicate name" }, 409);
  }

  // ❌ Business logic in controller
  const record = await prisma.example.create({
    data: { userId, name },
  });

  return c.json(record, 201);
});
```

**Controller responsibilities recap:**

- Parse/validate HTTP input (with Zod validators).
- Pull context values (`userId`, `profileId`, `workspaceId`, `requestId`).
- Call a service method.
- Map domain errors → HTTP status codes.
- Format the HTTP response body and status code.
