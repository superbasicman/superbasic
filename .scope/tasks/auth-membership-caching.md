# Implement Membership Caching

**Priority:** MEDIUM  
**Status:** TODO (Performance Optimization)  
**Created:** 2025-11-29  
**Depends On:** Redis infrastructure

## Overview

Implement Redis caching for workspace membership lookups to reduce database load and improve authorization performance. Cache `(userId, workspaceId) → roles` with 60-second TTL and proper invalidation.

## Tasks

### Infrastructure Setup

- [ ] 1. Add Redis to development environment
  - Update `docker-compose.yml` or local setup
  - Sanity check: `redis-cli ping` returns PONG

- [ ] 2. Add Redis client package
  - Install: `pnpm add ioredis` in `packages/auth-core`
  - Sanity check: Package appears in `packages/auth-core/package.json`

- [ ] 3. Create Redis connection module
  - File: `packages/auth-core/src/cache/redis.ts`
  - Export singleton Redis client
  - Sanity check: Module exports `redisClient` instance

### Cache Implementation

- [ ] 4. Create membership cache service
  - File: `packages/auth-core/src/cache/membership-cache.ts`
  - Implement: `getMembership(userId, workspaceId)`, `setMembership()`, `invalidateMembership()`
  - Sanity check: Service exports cache get/set/invalidate functions

- [ ] 5. Define cache key format
  - Format: `membership:{userId}:{workspaceId}`
  - TTL: 60 seconds
  - Sanity check: Key format documented in code comments

- [ ] 6. Integrate cache into resolveWorkspaceContext
  - File: `packages/auth-core/src/service.ts:635-649`
  - Check cache before DB query, populate cache on miss
  - Sanity check: Cache get called before `findWorkspaceMembership()`

- [ ] 7. Add cache invalidation on membership changes
  - Invalidate when user added/removed from workspace
  - Invalidate when user role changes
  - Sanity check: Cache invalidation called in membership update services

### Testing

- [ ] 8. Add cache tests
  - Test cache hit/miss scenarios
  - Test TTL expiration
  - Test invalidation
  - Sanity check: `pnpm --filter @repo/auth-core test cache --run` passes

- [ ] 9. Add integration tests
  - Verify cached memberships work for authorization
  - Verify invalidation prevents stale data
  - Sanity check: Auth middleware tests pass with caching enabled

- [ ] 10. Test cache failure fallback
  - Mock Redis unavailable
  - Verify graceful degradation to DB queries
  - Sanity check: System works when Redis is down

### Performance Validation

- [ ] 11. Measure performance improvement
  - Benchmark request latency before/after caching
  - Monitor DB query count reduction
  - Sanity check: Document avg latency reduction in PR

- [ ] 12. Monitor cache hit rate
  - Add metrics for cache hits vs misses
  - Target: >80% hit rate after warmup
  - Sanity check: Metrics show acceptable hit rate

## Configuration

Add environment variables:
```env
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true  # Feature flag
MEMBERSHIP_CACHE_TTL_SECONDS=60
```

## Files

- New: `packages/auth-core/src/cache/redis.ts`
- New: `packages/auth-core/src/cache/membership-cache.ts`
- New: `packages/auth-core/src/cache/__tests__/membership-cache.test.ts`
- Modified: `packages/auth-core/src/service.ts` (resolveWorkspaceContext)
- Modified: `packages/core/src/services/workspace-service.ts` (invalidation)

## Rollout Strategy

1. Deploy with `REDIS_ENABLED=false` (feature flag off)
2. Enable in staging, monitor for issues
3. Gradually enable in production (10% → 50% → 100%)
4. Monitor cache hit rates and error rates

## References

- Original gap: `.scope/tasks/auth-remaining-gaps.md` item #5
- Related: `packages/auth-core/src/service.ts:585-649` (workspace resolution)
