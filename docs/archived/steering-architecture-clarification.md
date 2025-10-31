# Steering Architecture Clarification

**Date**: 2025-10-31  
**Issue**: Mismatch between prescribed architecture and actual implementation

## Problem

The `.kiro/steering/best-practices.md` document prescribed a three-layer architecture (controllers → services → repositories) with examples referencing non-existent files like `apps/api/src/services/index.ts`. 

The actual Phase 1-3 implementation uses inline business logic and Prisma calls directly in route handlers (e.g., `apps/api/src/routes/v1/tokens/create.ts`), and `packages/core` only exports billing/ledger placeholders.

This mismatch could cause the agent to:
- Attempt disruptive refactors of working code
- Create disconnected scaffolding that doesn't integrate
- Waste time trying to match a pattern that doesn't exist

## Solution

Updated `best-practices.md` with clear warnings that the layered architecture is **aspirational guidance** for Phase 4+ features, not a requirement for existing code.

### Changes Made

1. **Added "Current State vs Target State" section** at top of Code Organization
2. **Added prominent warning box** before Layered Architecture Pattern section
3. **Updated Dependency Injection examples** to clarify they're for future features
4. **Updated Migration Strategy** to emphasize NOT refactoring existing code
5. **Updated "When to Deviate" section** to explicitly include Phase 1-3 code

### Key Messaging

- **Phase 1-3 code** (auth, tokens, profiles): Inline logic is acceptable, do not refactor
- **Phase 4+ features**: Apply layered pattern from the start
- **Bug fixes**: Keep changes minimal, no refactoring
- **Major refactors**: Only if explicitly requested by user

## Verification

Checked actual implementation:
- `apps/api/src/routes/v1/tokens/create.ts` - 120 lines with inline Prisma and business logic ✅
- `packages/core/src/index.ts` - Only exports billing/ledger placeholders ✅
- `apps/api/src/services/index.ts` - Does not exist ✅

Documentation now accurately reflects reality while providing guidance for future work.

## Related Files

- `.kiro/steering/best-practices.md` - Updated with warnings
- `apps/api/src/routes/v1/tokens/create.ts` - Example of current pattern
- `packages/core/src/index.ts` - Current minimal exports
