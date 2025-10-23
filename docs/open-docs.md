# Open Documentation - Sync Checklist

Quick reference list of documentation files that should be reviewed and updated after completing tasks or phases.

**Last Updated**: 2025-10-22

---

## Primary Tracking Documents

These documents track current status and should be updated after every task completion:

- `.kiro/steering/current-phase.md` - Current phase, task, and progress
- `docs/project_plan.md` - High-level roadmap with phase status

---

## Phase Documentation

Phase-specific documentation that should be updated during and after phase work:

### Active Phases

- `docs/oauth-setup-guide.md` - OAuth provider setup instructions (Phase 2.1)
- `docs/task-6-checklist.md` - Task 6 completion checklist (Phase 2.1)
- `docs/task-6-completion-summary.md` - Task 6 summary (Phase 2.1)

### Completed Phases

- `docs/phase-1-readme.md` - Phase 1 completion summary
- `docs/phase-2-readme.md` - Phase 2 completion summary
- `docs/phase-3-readme.md` - Phase 3 completion summary

---

## Technical Documentation

Core technical documentation that may need updates as features evolve:

- `docs/api-authentication.md` - API authentication guide (update when adding auth methods)
- `README.md` - Project overview and getting started (update for major changes)
- `apps/web/e2e/README.md` - E2E testing guide (update when adding test suites)

---

## Steering Documents

Architecture and standards documents (update less frequently):

- `.kiro/steering/database-schema.md` - Database schema reference
- `.kiro/steering/tech.md` - Technology stack
- `.kiro/steering/structure.md` - Project structure
- `.kiro/steering/best-practices.md` - Coding standards
- `.kiro/steering/product.md` - Product overview
- `.kiro/steering/task-hygiene.md` - Documentation and cleanup guidelines

---

## Archived Documentation

Completed work and troubleshooting docs (no updates needed):

- `docs/archived/` - Historical documentation and troubleshooting guides

---

## Update Triggers

**After completing a task:**

1. Update `.kiro/steering/current-phase.md` with task status
2. Update `docs/project_plan.md` if deliverables changed
3. Update task-specific checklist (e.g., `docs/task-6-checklist.md`)
4. Create completion summary if task was complex

**After completing a phase:**

1. Create `docs/phase-N-readme.md` with comprehensive summary
2. Update `.kiro/steering/current-phase.md` to next phase
3. Update `docs/project_plan.md` to mark phase complete
4. Archive any temporary troubleshooting docs to `docs/archived/`

**After major feature changes:**

1. Update `docs/api-authentication.md` if auth methods changed
2. Update `README.md` if setup process changed
3. Update steering docs if architecture changed

---

## Notes

- Task-level tracking files (`.kiro/specs/*/tasks.md`) are not listed here - they're tracked via `current-phase.md`
- Spec files (requirements, design) are not listed - they're reference docs, not status trackers
- This file should be reviewed weekly to ensure it stays current
