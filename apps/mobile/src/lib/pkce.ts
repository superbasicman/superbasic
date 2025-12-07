/**
 * Platform-agnostic PKCE utilities entry point
 * Metro bundler will automatically resolve to:
 * - pkce.native.ts for iOS/Android (uses expo-crypto)
 * - pkce.web.ts for web (uses Web Crypto API / crypto.subtle)
 *
 * This file exists for TypeScript compatibility and as a fallback.
 */

export * from './pkce.native';
