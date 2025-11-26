# errors-to-fix

Deploy check mode: Full (lint + typecheck + test + build)

The deploy check failed with:

- **Check:** Running tests
- **Command:** `pnpm run test`

Last part of the command output:

```
 + Received
@repo/api:test: 
@repo/api:test: - 403
@repo/api:test: + 200
@repo/api:test: 
@repo/api:test:  ❯ src/middleware/__tests__/scopes.test.ts:298:31
@repo/api:test:     296|       });
@repo/api:test:     297| 
@repo/api:test:     298|       expect(response.status).toBe(403);
@repo/api:test:        |                               ^
@repo/api:test:     299| 
@repo/api:test:     300|       const data = await response.json();
@repo/api:test: 
@repo/api:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/12]⎯
@repo/api:test: 
@repo/api:test:  FAIL  src/middleware/__tests__/scopes.test.ts > Scope Enforcement Middleware > Multiple Scopes > should deny PAT with multiple scopes but missing required scope
@repo/api:test: AssertionError: expected 200 to be 403 // Object.is equality
@repo/api:test: 
@repo/api:test: - Expected
@repo/api:test: + Received
@repo/api:test: 
@repo/api:test: - 403
@repo/api:test: + 200
@repo/api:test: 
@repo/api:test:  ❯ src/middleware/__tests__/scopes.test.ts:364:31
@repo/api:test:     362|       });
@repo/api:test:     363| 
@repo/api:test:     364|       expect(response.status).toBe(403);
@repo/api:test:        |                               ^
@repo/api:test:     365| 
@repo/api:test:     366|       const data = await response.json();
@repo/api:test: 
@repo/api:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/12]⎯
@repo/api:test: 
@repo/api:test:  FAIL  src/middleware/__tests__/scopes.test.ts > Scope Enforcement Middleware > Error Response Format > should return 403 with error and required scope in response
@repo/api:test: AssertionError: expected 200 to be 403 // Object.is equality
@repo/api:test: 
@repo/api:test: - Expected
@repo/api:test: + Received
@repo/api:test: 
@repo/api:test: - 403
@repo/api:test: + 200
@repo/api:test: 
@repo/api:test:  ❯ src/middleware/__tests__/scopes.test.ts:394:31
@repo/api:test:     392|       });
@repo/api:test:     393| 
@repo/api:test:     394|       expect(response.status).toBe(403);
@repo/api:test:        |                               ^
@repo/api:test:     395| 
@repo/api:test:     396|       const data = await response.json();
@repo/api:test: 
@repo/api:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/12]⎯
@repo/api:test: 
@repo/api:test:  FAIL  src/middleware/__tests__/scopes.test.ts > Scope Enforcement Middleware > Session vs PAT Auth Behavior > should enforce scopes for PAT auth but not session auth
@repo/api:test: AssertionError: expected 200 to be 403 // Object.is equality
@repo/api:test: 
@repo/api:test: - Expected
@repo/api:test: + Received
@repo/api:test: 
@repo/api:test: - 403
@repo/api:test: + 200
@repo/api:test: 
@repo/api:test:  ❯ src/middleware/__tests__/scopes.test.ts:456:39
@repo/api:test:     454|         },
@repo/api:test:     455|       });
@repo/api:test:     456|       expect(patWriteResponse.status).toBe(403);
@repo/api:test:        |                                       ^
@repo/api:test:     457| 
@repo/api:test:     458|       // Session should have write access
@repo/api:test: 
@repo/api:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/12]⎯
@repo/api:test: 
@repo/api:test:  Test Files  3 failed | 22 passed (25)
@repo/api:test:       Tests  12 failed | 236 passed | 6 skipped (254)
@repo/api:test:    Start at  09:59:47
@repo/api:test:    Duration  293.88s (transform 1.64s, setup 133ms, collect 7.00s, tests 285.45s, environment 0ms, prepare 157ms)
@repo/api:test: 
@repo/api:test:  ELIFECYCLE  Test failed. See above for more details.
@repo/api:test: ERROR: command finished with error: command (/Users/Sharhino/Desktop/Isaac/superbasic-monorepo-scratch/apps/api) /Users/Sharhino/.nvm/versions/node/v20.18.1/bin/pnpm run test --run exited (1)
@repo/api#test: command (/Users/Sharhino/Desktop/Isaac/superbasic-monorepo-scratch/apps/api) /Users/Sharhino/.nvm/versions/node/v20.18.1/bin/pnpm run test --run exited (1)

 Tasks:    15 successful, 16 total
Cached:    15 cached, 16 total
  Time:    4m56.737s 
Failed:    @repo/api#test

 ERROR  run failed: command  exited (1)
 ELIFECYCLE  Test failed. See above for more details.
```

Review the command output above, fix the issues, and rerun `pnpm deploy-check`.
