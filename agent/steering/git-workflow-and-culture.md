# Git Workflow, Culture & Collaboration

This doc describes how we use git and collaborate around changes. Agents do **not** run mutating git commands; the user controls the repo.

## 1. Agent boundaries with git

- Do **not** run:
  - `git add`, `git commit`, `git push`, `git merge`, `git rebase`, etc.
- It’s fine to **read** git state for context:
  - `git status`
  - `git diff`
  - `git log`
- Focus your work on:
  - Editing files.
  - Keeping changes focused and cohesive.
  - Leaving clear notes or checklists that the user can turn into commits.

## 2. Branching & PR philosophy

(For humans using the repo; agents should align with the spirit.)

- Prefer **feature-focused branches** over giant, multi-purpose branches.
- Keep PRs:
  - Small and reviewable.
  - Scoped to a single concern (for example, “add budgets API” vs “budgets + UI + refactor auth”).
- Flag risky areas early:
  - Auth changes.
  - Billing/Stripe logic.
  - Database migrations / RLS changes.

## 3. Collaboration culture

- Prefer **clarity over cleverness**:
  - Good naming reduces the need for heavy comments.
  - Use comments when intent isn’t obvious or when something deviates from the usual patterns.
- Celebrate deletions:
  - Removing unused code, dead flags, and duplicate patterns is valuable work.
- When specs and code diverge:
  - Update the spec and point to it in code comments.
  - Leave a short rationale if you need to deviate from a pattern (for example, breaking a layering rule for a pragmatic reason).

## 4. Practical notes for agents

- When making non-trivial changes:
  - Suggest a concise commit message in your notes (the user will actually commit).
  - Call out any follow-ups or TODOs that should become future tasks.
- When you’re unsure:
  - Prefer asking for clarification rather than guessing on auth, billing, or schema changes.
