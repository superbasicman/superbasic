// Context
// Goal: align auth code with end-auth target by removing direct Prisma usage except in allowed layers.
// Marking:
// - [ ] needs refactor away from Prisma
// - [x] refactor done (Prisma-free)
// - [ok] intentional Prisma usage allowed (e.g., database package or shared test infra)
// As you complete an item, flip [ ] → [x]; use [ok] for the few files that should keep Prisma.

// ===== apps/api =====
1.  [x] apps/api/vitest.config.ts
2.  [x] apps/api/vitest.setup.ts

// ===== apps/api/src/lib =====
3.  [x] apps/api/src/lib/audit-logger.ts
4.  [x] apps/api/src/lib/auth-service.ts
5.  [x] apps/api/src/lib/identity-provider.ts
6.  [x] apps/api/src/lib/oauth-authorization-codes.ts
7.  [x] apps/api/src/lib/pat-tokens.ts
8.  [x] apps/api/src/lib/session-revocation.ts
9.  [x] apps/api/src/lib/user-claims.ts

// ===== apps/api/src/lib/__tests__ =====
10. [x] apps/api/src/lib/__tests__/audit-logger.test.ts

// ===== apps/api/src/middleware =====
11. [x] apps/api/src/middleware/auth-context.ts
12. [x] apps/api/src/middleware/pat.ts

// ===== apps/api/src/middleware/__tests__ =====
13. [x] apps/api/src/middleware/__tests__/auth-unified.test.ts
14. [x] apps/api/src/middleware/__tests__/pat.test.ts
15. [x] apps/api/src/middleware/__tests__/rate-limit-integration.test.ts
16. [x] apps/api/src/middleware/__tests__/scopes.test.ts

// ===== apps/api/src/routes/v1 =====
17. [x] apps/api/src/routes/v1/me.ts

// ===== apps/api/src/routes/v1/__tests__ =====
18. [x] apps/api/src/routes/v1/__tests__/auth-refresh.test.ts
19. [x] apps/api/src/routes/v1/__tests__/auth-session.test.ts
20. [x] apps/api/src/routes/v1/__tests__/me.test.ts
21. [x] apps/api/src/routes/v1/__tests__/register.test.ts

// ===== apps/api/src/routes/v1/auth =====
22. [x] apps/api/src/routes/v1/auth/bulk-revoke.ts
23. [x] apps/api/src/routes/v1/auth/google.ts
24. [x] apps/api/src/routes/v1/auth/magic-link.ts
25. [x] apps/api/src/routes/v1/auth/refresh-utils.ts
26. [x] apps/api/src/routes/v1/auth/refresh.ts
27. [x] apps/api/src/routes/v1/auth/session.ts
28. [x] apps/api/src/routes/v1/auth/sessions.ts
29. [x] apps/api/src/routes/v1/auth/sso-logout.ts

// ===== apps/api/src/routes/v1/oauth =====
30. [x] apps/api/src/routes/v1/oauth/authorize.ts
31. [x] apps/api/src/routes/v1/oauth/revoke.ts
32. [x] apps/api/src/routes/v1/oauth/token.ts

// ===== apps/api/src/routes/v1/oauth/__tests__ =====
33. [x] apps/api/src/routes/v1/oauth/__tests__/authorize.test.ts
34. [x] apps/api/src/routes/v1/oauth/__tests__/revoke.test.ts
35. [x] apps/api/src/routes/v1/oauth/__tests__/token.test.ts

// ===== apps/api/src/routes/v1/tokens/__tests__ =====
36. [x] apps/api/src/routes/v1/tokens/__tests__/create.test.ts
37. [x] apps/api/src/routes/v1/tokens/__tests__/list.test.ts
38. [x] apps/api/src/routes/v1/tokens/__tests__/revoke.test.ts
39. [x] apps/api/src/routes/v1/tokens/__tests__/update.test.ts

// ===== apps/api/src/services =====
40. [x] apps/api/src/services/index.ts

// ===== apps/api/src/test =====
// (Shared test infra – *optionally* OK to use Prisma directly)
41. [ok] apps/api/src/test/helpers.ts
42. [ok] apps/api/src/test/infrastructure.test.ts
43. [x] apps/api/src/test/README.md
44. [ok] apps/api/src/test/setup.ts

// ===== docs =====
45. [x] docs/vercel-deployment-guide.md

// ===== packages/auth =====
46. [x] packages/auth/package.json
47. [x] packages/auth/tsup.config.ts

// ===== packages/auth/src =====
48. [x] packages/auth/src/profile.ts

// ===== packages/auth/src/__tests__ =====
49. [x] packages/auth/src/__tests__/profile.test.ts

// ===== packages/auth-core/src =====
50. [x] packages/auth-core/src/json.ts
51. [x] packages/auth-core/src/oauth-client-auth.ts
52. [x] packages/auth-core/src/oauth-clients.ts
53. [x] packages/auth-core/src/service.ts
54. [x] packages/auth-core/src/token-service.ts


// ===== packages/auth-core/src/__tests__ =====
55. [x] packages/auth-core/src/__tests__/auth-context.test.ts
56. [x] packages/auth-core/src/__tests__/auth-service.test.ts
57. [x] packages/auth-core/src/__tests__/oauth-clients.test.ts
58. [x] packages/auth-core/src/__tests__/token-service.test.ts

// ===== packages/core/src/profiles =====
59. [ok] packages/core/src/profiles/profile-repository.ts
60. [x] packages/core/src/profiles/profile-service.ts

// ===== packages/core/src/profiles/__tests__ =====
61. [ok] packages/core/src/profiles/__tests__/profile-repository.test.ts
62. [x] packages/core/src/profiles/__tests__/profile-service.test.ts

// ===== packages/core/src/security =====
63. [ok] packages/core/src/security/security-event-repository.ts

// ===== packages/core/src/tokens =====
64. [ok] packages/core/src/tokens/token-repository.ts
65. [x] packages/core/src/tokens/token-service.ts

// ===== packages/core/src/tokens/__tests__ =====
66. [ok] packages/core/src/tokens/__tests__/token-repository.test.ts

// ===== packages/core/src/users =====
67. [ok] packages/core/src/users/user-repository.ts

// ===== packages/core/src/users/__tests__ =====
68. [ ] packages/core/src/users/__tests__/user-repository.test.ts

// ===== packages/core/src/verification =====
69. [ ] packages/core/src/verification/verification-repository.ts
70. [ ] packages/core/src/verification/verification-service.ts

// ===== packages/core/src/verification/__tests__ =====
71. [ ] packages/core/src/verification/__tests__/verification-service.test.ts

// ===== packages/database =====
// (Database layer – definitely OK to use Prisma here)
72. [ok] packages/database/package.json
73. [ok] packages/database/schema.prisma
74. [ok] packages/database/scripts/execute_with_env.sh
75. [ok] packages/database/src/context.ts
76. [ok] packages/database/src/index.ts
