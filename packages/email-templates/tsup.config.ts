import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false, // Disabled due to React 18/19 types conflict with react-email
  clean: true,
  sourcemap: true,
  external: ['react'],
});
