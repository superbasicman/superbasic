import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/events.ts'],
  format: ['esm', 'cjs'],
  dts: true, // Re-enabled to generate types for events
  clean: true,
  sourcemap: true,
  external: ['@prisma/client', '@repo/database'],
});
