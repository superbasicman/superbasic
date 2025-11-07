# Git Workflow, Culture & Collaboration

## Git Workflow

- **NEVER run git commands** (`git add`, `git commit`, `git push`, etc.) when making code changes as an agent.
- **User handles version control** – focus only on making the requested code changes.
- **Exception**: Reading git state is fine (`git status`, `git log`, `git diff`) if needed for context.
- **Rationale**: The user maintains control over commit messages, staging, and push timing.

## Culture & Collaboration

- Keep comments concise; prefer clear naming over verbose explanations.
- Raise questions when requirements conflict with security or production readiness; don’t assume intent.
- Celebrate simplifications—deleting unused code is a win.
- Prefer incremental improvements over big-bang refactors unless explicitly requested.
