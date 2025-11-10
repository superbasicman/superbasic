# Delivery Hygiene & Task Tracking

How to keep changes tidy, documented, and easy to reason about.

## 1. Documentation & file layout

- Centralize docs under `docs/`:
  - `docs/architecture/`
  - `docs/guides/`
  - `docs/api/`
  - `docs/operations/`
  - `docs/archived/` for old material you might need later.
- When you add a new doc:
  - Link it from `README.md` or a relevant index so it’s discoverable.
- Temporary scripts:
  - Live under something like `scripts/temp/` while in active use.
  - Either delete them when done or promote them into `tooling/scripts/` with a short doc.

## 2. Task tracking

- Use numbered checklists in `.scope/tasks/` for non-trivial work:
  - One file per feature or workstream.
  - Each task uses `[ ]` / `[x]` for status.
- Example pattern:

  1. `[ ]` Task name – quick description.
  2. `[ ]` Another task – what it should achieve.

- For each task, add **Sanity Checks**:
  - Concrete steps to verify the task is truly done (for example, a curl command, a test run, or a UI flow).
  - Prefer checks that can be re-run later.

## 3. Wrap-up checklist for a change

Before considering a task or PR “done”:

1. Code is in place and passes lint, typecheck, and unit/integration tests.
2. Docs/specs updated:
   - API docs or `database-structure-*.md` if contracts/schema changed.
   - Any relevant guides or operations docs.
3. Temporary scripts either removed or promoted to a stable home.
4. `.scope/current-phase.md` and `.scope/project_plan.md` updated if scope or milestones changed.
5. Sanity checks documented or refreshed so someone else can verify the change.

## 4. Tests from an agent context

- When running tests in an automated or non-interactive environment:
  - Use `vitest --run` / `pnpm test -- --run` to avoid watch mode.
- For new or changed behavior:
  - Add at least one test at the most appropriate layer (unit, integration, or E2E).
  - Prefer explicit test names that describe the user-visible behavior or invariant.
