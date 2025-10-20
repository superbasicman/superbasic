import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['bcrypt', '@mapbox/node-pre-gyp', 'mock-aws-s3', 'aws-sdk', 'nock'],
});
