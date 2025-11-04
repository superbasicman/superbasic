/**
 * Rate limiting middleware exports
 * 
 * This module provides focused rate limiting middleware for different use cases:
 * - Auth rate limiting (10 req/min per IP)
 * - Token creation rate limiting (10 tokens/hour per user)
 * - Magic link rate limiting (3 req/hour per email)
 * - Failed auth tracking utilities
 */

export { authRateLimitMiddleware } from './auth-rate-limit.js';
export { tokenCreationRateLimitMiddleware } from './token-rate-limit.js';
export { magicLinkRateLimitMiddleware } from './magic-link-rate-limit.js';
export { credentialsRateLimitMiddleware } from './credentials-rate-limit.js';
export { trackFailedAuth, checkFailedAuthRateLimit } from './failed-auth-tracking.js';
