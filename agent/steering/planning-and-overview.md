Guidelines to keep work focused, production-ready, and simple while we reshape the repo.

- When assigned with a task, before coding, create a file in .scope/tasks/ directory. in the file create a task-list. The task list should be numbered and use [ ] so we can later mark complete with [x]. At the end of each task add a clear sannity check i can test (if applicable). Once task list is completed wait for the user to fire off the tasks one item at a time.
- Task lists should be feature-aligned optimized, not giant dumps
- Flag risky changes early (auth, billing, migrations) so we can plan rollbacks.