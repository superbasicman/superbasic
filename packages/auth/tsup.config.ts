import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false, // Disabled due to Auth.js type issues with exactOptionalPropertyTypes
  clean: true,
  sourcemap: true,
  external: ['@prisma/client', '@repo/database'],
});
