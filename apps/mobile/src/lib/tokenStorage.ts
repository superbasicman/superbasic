/**
 * Platform-agnostic token storage entry point
 * Metro bundler will automatically resolve to:
 * - tokenStorage.native.ts for iOS/Android
 * - tokenStorage.web.ts for web
 *
 * This file exists for TypeScript compatibility and as a fallback.
 */

export * from './tokenStorage.native';
