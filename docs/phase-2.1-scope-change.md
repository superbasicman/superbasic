# Phase 2.1 Scope Change - GitHub OAuth Deferred

**Date**: 2025-10-22  
**Decision**: Defer GitHub OAuth to Phase 16 (Advanced Features)

---

## Rationale

After completing Task 6 (Google OAuth), we're streamlining Phase 2.1 to focus on:
1. **Google OAuth** (✅ complete)
2. **Magic Link authentication** (next priority)

GitHub OAuth is being deferred to Phase 16 to:
- Reduce scope and accelerate delivery
- Focus on core authentication methods first
- Maintain architectural flexibility for future providers

---

## What Changed

### Phase 2.1 (Auth.js Migration)
**Before**: Google OAuth + GitHub OAuth + Magic Links  
**After**: Google OAuth + Magic Links only

### Phase 16 (Advanced Features)
**Added**: Additional OAuth providers (GitHub, Apple, Microsoft)

---

## Task Renumbering

Tasks have been renumbered to remove GitHub-specific tasks:

| Old Task | New Task | Description |
|----------|----------|-------------|
| Task 7 | ~~Removed~~ | Register GitHub OAuth App |
| Task 8 | ~~Removed~~ | Add GitHub to Auth.js Config |
| Task 9 | Task 7 | Choose and Configure Email Service |
| Task 10 | Task 8 | Add Email Provider to Auth.js Config |
| Task 11 | Task 9 | Create Magic Link Email Template |
| Task 12 | ~~Removed~~ | Test GitHub OAuth Flow |
| Task 13 | Task 10 | Test Magic Link Flow |
| ... | ... | (all subsequent tasks renumbered) |

---

## Documentation Updates

### Files Updated
1. ✅ `docs/project_plan.md` - Phase 2.1 and Phase 16 deliverables
2. ✅ `.kiro/specs/authjs-migration/tasks.md` - Task list renumbered
3. ✅ `.kiro/steering/current-phase.md` - Current task updated to Task 7
4. ✅ `README.md` - GitHub OAuth marked as Phase 16
5. ✅ `docs/open-docs.md` - Documentation index (no changes needed)

### Environment Variables
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Active (Phase 2.1)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - Deferred (Phase 16)
- `EMAIL_SERVER` / `EMAIL_FROM` - Next priority (Phase 2.1)

---

## Architecture Benefits

This change maintains our extensible OAuth architecture:
- Google OAuth proves the pattern works
- Adding GitHub/Apple later requires no refactoring
- Just add provider to `packages/auth/src/config.ts`
- Environment variables and UI follow same pattern

---

## Next Steps

**Current Task**: Task 7 - Choose and Configure Email Service

**Sub-Phase 3 Focus** (Magic Links):
1. Task 7: Email service setup (Resend recommended)
2. Task 8: Add Email provider to Auth.js config
3. Task 9: Create magic link email template
4. Task 10: Test magic link flow
5. Task 11: Implement rate limiting (3 per hour)

---

## Exit Criteria (Updated)

Phase 2.1 is complete when:
- [x] Google OAuth working (Task 6 complete)
- [ ] Magic link authentication working
- [ ] Auth middleware supports Auth.js sessions
- [ ] All 241 tests passing
- [ ] Web client updated for OAuth + magic links
- [ ] Documentation complete

GitHub OAuth will be added in Phase 16 alongside other advanced features.

---

**Last Updated**: 2025-10-22  
**Status**: Scope change implemented, ready to proceed with Task 7
