# errors-to-fix

Deploy check mode: Full (lint + typecheck + test + build)

The deploy check failed with:

- **Check:** Running tests
- **Command:** `pnpm run test`

Last part of the command output:

```
:23:18
@repo/api:test:  ❯ Object.setup src/test/global-setup.ts:25:3
@repo/api:test:  ❯ WorkspaceProject.initializeGlobalSetup ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:9926:24
@repo/api:test:  ❯ Vitest.initializeGlobalSetup ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10794:7
@repo/api:test:  ❯ ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10816:7
@repo/api:test:  ❯ Vitest.runFiles ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10840:12
@repo/api:test:  ❯ Vitest.start ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10682:7
@repo/api:test:  ❯ startVitest ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11848:7
@repo/api:test:  ❯ start ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cac.CB_9Zo9Q.js:1506:17
@repo/api:test: 
@repo/api:test: Caused by: PrismaClientInitializationError: Can't reach database server at `localhost:5432`
@repo/api:test: 
@repo/api:test: Please make sure your database server is running at `localhost:5432`.
@repo/api:test:  ❯ r ../../node_modules/.pnpm/@prisma+client@6.17.1_prisma@6.17.1_magicast@0.3.5_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:112:2770
@repo/api:test:  ❯ createPrismaClientWithRetry src/test/setup.ts:140:7
@repo/api:test:  ❯ Module.setupTestDatabase src/test/setup.ts:23:18
@repo/api:test:  ❯ Object.setup src/test/global-setup.ts:25:3
@repo/api:test:  ❯ WorkspaceProject.initializeGlobalSetup ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:9926:24
@repo/api:test:  ❯ Vitest.initializeGlobalSetup ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10794:7
@repo/api:test:  ❯ ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10816:7
@repo/api:test:  ❯ Vitest.runFiles ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10840:12
@repo/api:test:  ❯ Vitest.start ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:10682:7
@repo/api:test:  ❯ startVitest ../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.18.10_@vitest+ui@4.0.2_terser@5.44.0/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11848:7
@repo/api:test: 
@repo/api:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
@repo/api:test: Serialized Error: { clientVersion: '6.17.1', errorCode: 'P1001', retryable: undefined }
@repo/api:test: 
@repo/api:test: 
@repo/api:test: 
@repo/api:test:  ELIFECYCLE  Test failed. See above for more details.
@repo/api:test: ERROR: command finished with error: command (/Users/isaacrobles/Documents/work/superbasic/apps/api) /Users/isaacrobles/.local/state/fnm_multishells/2830_1764178787136/bin/pnpm run test --run exited (1)
@repo/api#test: command (/Users/isaacrobles/Documents/work/superbasic/apps/api) /Users/isaacrobles/.local/state/fnm_multishells/2830_1764178787136/bin/pnpm run test --run exited (1)

 Tasks:    15 successful, 16 total
Cached:    15 cached, 16 total
  Time:    1.547s 
Failed:    @repo/api#test

 ERROR  run failed: command  exited (1)
 ELIFECYCLE  Test failed. See above for more details.
```

Review the command output above, fix the issues, and rerun `pnpm deploy-check`.
