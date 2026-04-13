---
'vercel': patch
---

feat(cli): add --all flag to blob list-stores

When in a linked project directory, `blob list-stores` now hints about `--all` when no stores are connected to the project. Use `--all` to list all team stores regardless of project connection, matching the pattern from `integration list --all`.
