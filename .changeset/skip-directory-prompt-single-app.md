---
'vercel': patch
---

Skip the `In which directory is your code located?` prompt for single-app projects. The CLI now detects whether the current directory is a workspace (monorepo) via `getWorkspaces` and only asks the question when there's actually a choice to make. For ~80% of users (single-app projects) this cuts one prompt off the first-run flow.
