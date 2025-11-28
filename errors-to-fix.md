# errors-to-fix

Deploy check mode: Full (lint + typecheck + test + build)

The deploy check failed with:

- **Check:** Running tests
- **Command:** `pnpm run test`

Last part of the command output:

```
3]⎯
@repo/api:test: 
@repo/api:test:  FAIL  src/routes/v1/tokens/__tests__/create.test.ts > POST /v1/tokens - Token Creation > Successful Token Creation > should store token hash in database (not plaintext)
@repo/api:test: AssertionError: expected 'faO3lrSU385JzX0QZE7mDOXFkdHVVJDrgLGqm…' to be 'on9Iyd5i/tIHPvnkanAGKyGJLNkIblb/WtcXE…' // Object.is equality
@repo/api:test: 
@repo/api:test: Expected: "on9Iyd5i/tIHPvnkanAGKyGJLNkIblb/WtcXEHWLxK4="
@repo/api:test: Received: "faO3lrSU385JzX0QZE7mDOXFkdHVVJDrgLGqmASOMJY="
@repo/api:test: 
@repo/api:test:  ❯ src/routes/v1/tokens/__tests__/create.test.ts:121:35
@repo/api:test:     119|       const expectedEnvelope = createTokenHashEnvelope(plaintextToken);
@repo/api:test:     120|       expect(storedEnvelope.hash).not.toBe(plaintextToken);
@repo/api:test:     121|       expect(storedEnvelope.hash).toBe(expectedEnvelope.hash);
@repo/api:test:        |                                   ^
@repo/api:test:     122|       expect(storedEnvelope.keyId).toBe(expectedEnvelope.keyId);
@repo/api:test:     123|     });
@repo/api:test: 
@repo/api:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯
@repo/api:test: 
@repo/api:test:  FAIL  src/routes/v1/tokens/__tests__/revoke.test.ts > DELETE /v1/tokens/:id - Token Revocation > Audit Event Emission > should emit token.revoked event on successful revocation
@repo/api:test: AssertionError: expected "spy" to be called with arguments: [ ObjectContaining{…} ]
@repo/api:test: 
@repo/api:test: Received: 
@repo/api:test: 
@repo/api:test:   1st spy call:
@repo/api:test: 
@repo/api:test:   Array [
@repo/api:test: -   ObjectContaining {
@repo/api:test: -     "metadata": ObjectContaining {
@repo/api:test: -       "profileId": "75da361c-27da-4717-acbe-f718c384121f",
@repo/api:test: +   Object {
@repo/api:test: +     "metadata": Object {
@repo/api:test: +       "ip": "unknown",
@repo/api:test: +       "requestId": "unknown",
@repo/api:test: +       "timestamp": "2025-11-28T23:08:46.336Z",
@repo/api:test:         "tokenId": "b3abdb3e-ad6a-4005-bbc1-60f4acf4176e",
@repo/api:test: -       "tokenName": "75da361c-27da-4717-acbe-f718c384121f",
@repo/api:test: +       "userAgent": "unknown",
@repo/api:test:       },
@repo/api:test: +     "timestamp": 2025-11-28T23:08:46.336Z,
@repo/api:test:       "type": "token.revoked",
@repo/api:test:       "userId": "9d784c74-1ad4-4345-9c29-708e882bd036",
@repo/api:test:     },
@repo/api:test:   ]
@repo/api:test: 
@repo/api:test: 
@repo/api:test: Number of calls: 1
@repo/api:test: 
@repo/api:test:  ❯ src/routes/v1/tokens/__tests__/revoke.test.ts:357:28
@repo/api:test:     355|       await new Promise((resolve) => setTimeout(resolve, 100));
@repo/api:test:     356| 
@repo/api:test:     357|       expect(eventHandler).toHaveBeenCalledWith(
@repo/api:test:        |                            ^
@repo/api:test:     358|         expect.objectContaining({
@repo/api:test:     359|           type: "token.revoked",
@repo/api:test: 
@repo/api:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯
@repo/api:test: 
@repo/api:test:  Test Files  2 failed | 23 passed (25)
@repo/api:test:       Tests  3 failed | 245 passed | 6 skipped (254)
@repo/api:test:    Start at  15:08:42
@repo/api:test:    Duration  11.53s (transform 218ms, setup 27ms, collect 554ms, tests 10.79s, environment 0ms, prepare 25ms)
@repo/api:test: 
@repo/api:test:  ELIFECYCLE  Test failed. See above for more details.
@repo/api:test: ERROR: command finished with error: command (/Users/isaacrobles/Documents/work/superbasic/apps/api) /Users/isaacrobles/.local/state/fnm_multishells/12314_1764369423959/bin/pnpm run test --run exited (1)
@repo/api#test: command (/Users/isaacrobles/Documents/work/superbasic/apps/api) /Users/isaacrobles/.local/state/fnm_multishells/12314_1764369423959/bin/pnpm run test --run exited (1)

 Tasks:    15 successful, 16 total
Cached:    14 cached, 16 total
  Time:    13.91s 
Failed:    @repo/api#test

 ERROR  run failed: command  exited (1)
 ELIFECYCLE  Test failed. See above for more details.
```

Review the command output above, fix the issues, and rerun `pnpm deploy-check`.
