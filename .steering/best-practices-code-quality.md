# Code Quality & Style

## Code Quality

- Write DRY, modular code—extract repeated logic into small, focused functions.
- Keep functions ideally under ~50 lines; break down complex logic into composable pieces.
- Prefer readable code over clever code; clear naming beats comments, but still add comments where intent isn’t obvious.
- Extract magic numbers and strings into named constants.
- Avoid deeply nested conditionals; use early returns and guard clauses.
- Use `async/await` for asynchronous code; avoid callback hell and deeply nested promises.