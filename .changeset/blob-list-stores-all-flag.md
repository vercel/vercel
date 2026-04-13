---
'vercel': patch
---

feat(cli): add --all flag to blob list-stores, --yes flag to blob delete-store

- `blob list-stores --all`: list all team stores regardless of project connection. Hints about `--all` when no stores are connected to the current project.
- `blob delete-store --yes`: skip confirmation prompt for CI/scripts.
