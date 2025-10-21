# Task Hygiene & Artifact Management

Guidelines for keeping the workspace clean during and after task execution.

## Documentation Organization

### Centralize Documentation

- When completing a task, consolidate any `.md` files (README, guides, docs) into the `docs/` directory
- Use clear, descriptive filenames: `docs/api-authentication.md`, `docs/plaid-integration.md`
- Update the main `README.md` to link to relevant documentation in `docs/`
- Avoid scattered documentation across multiple directories unless there's a strong reason (e.g., package-specific READMEs)

### Documentation Structure

```
docs/
├─ architecture/          # System design and architecture decisions
├─ guides/                # How-to guides and tutorials
├─ api/                   # API documentation (if not auto-generated)
└─ operations/            # Deployment, monitoring, 
└─ archived/              # Archived docs we no longer need
```

### When to Keep Package-Level Docs

- Package-specific READMEs are acceptable for `packages/sdk/README.md` or similar public-facing packages
- Keep technical implementation notes in `docs/` rather than scattered across the monorepo
- If a package README duplicates content, consolidate it into `docs/` and link from the package

## Temporary Script Management

### One-Time Scripts

- Scripts created for a specific task that won't be reused should be marked clearly
- Place temporary scripts in a `scripts/temp/` directory during development
- **Delete temporary scripts** after the task is complete and verified
- Document what the script did in the task completion notes or commit message

### Script Lifecycle

1. **During Task**: Create script in `scripts/temp/{task-name}-{purpose}.ts`
2. **After Verification**: If the script worked and won't be needed again, delete it
3. **If Reusable**: Move to `tooling/scripts/` with proper documentation and error handling

### Examples of Temporary Scripts

- One-time data migrations or backfills
- Test data generation for a specific feature
- Debugging utilities for a particular issue
- Setup scripts that are replaced by proper tooling

### Examples of Permanent Scripts

- Database seeding for development
- CI/CD automation
- Release and versioning tools
- Recurring maintenance tasks

## Task Completion Checklist

When finishing a task:

- [ ] Consolidate any documentation into `docs/` with clear structure
- [ ] Delete temporary scripts from `scripts/temp/`
- [ ] Update main `README.md` if new documentation was added
- [ ] Remove any debug code, console.logs, or commented-out experiments
- [ ] Clean up any test fixtures or mock data that aren't needed
- [ ] Verify no orphaned files or directories were left behind
- [ ] Refresh /steering/current-phase.md to reflect the current task or subtask status
- [ ] Refresh /docs/project_plan.md to reflect the current task or subtask status

## Phase Completion Checklist

When finishing a phase:

- [ ] Create phase readme document in `docs/phase-N-readme.md`
- [ ] Include comprehensive "Sanity Checks" section with curl commands
- [ ] Document all deliverables with file locations
- [ ] List key learnings and architecture decisions
- [ ] Include performance metrics and test results
- [ ] Document migration steps (if any)
- [ ] List next steps and preparation for next phase
- [ ] Update `docs/project_plan.md` to mark phase as complete
- [ ] Update `.kiro/steering/current-phase.md` with completion summary
- [ ] Archive any debug/troubleshooting documents to `docs/archived/`

### Sanity Checks Guidelines

Every phase readme should include a "Sanity Checks" section with:

- **Executable commands**: Use curl, pnpm, or bash commands that can be copy-pasted
- **Expected outputs**: Show what success looks like
- **Failure scenarios**: Test error cases (401, 403, 429, etc.)
- **End-to-end flows**: Test complete user journeys
- **Test suite verification**: Command to run all tests with expected results
- **Web UI verification**: Steps to manually test in browser
- **Log verification**: How to check audit logs and structured logging

**Example Structure:**
```markdown
## Sanity Checks

### ✅ Feature Creation Check
\`\`\`bash
# Command to test feature
curl -X POST http://localhost:3000/v1/endpoint \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'

# Should return:
# {"success":true,"id":"..."}
\`\`\`

### ✅ Error Handling Check
\`\`\`bash
# Test error case
curl -X POST http://localhost:3000/v1/endpoint \
  -H "Content-Type: application/json" \
  -d '{"invalid":"data"}'

# Should return 400 with validation error
\`\`\`
```

This ensures every phase can be quickly validated after deployment or when onboarding new developers.

## Rationale

- **Centralized docs** make it easier for new developers to find information
- **Deleting temp scripts** prevents confusion about what's actually used in production
- **Clean workspace** reduces cognitive load and makes the codebase more maintainable
- **Clear artifact lifecycle** prevents accumulation of technical debt
