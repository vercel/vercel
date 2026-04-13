---
'vercel': minor
---

feat(cli): CI-friendly flags for blob store commands

- `blob list-stores --all`: list all team stores regardless of project connection. Hints about `--all` when no stores are connected to the current project.
- `blob delete-store --yes`: skip confirmation prompt for CI/scripts.
- `blob create-store --yes`: auto-connect to linked project with all environments, skip prompts.
- `blob create-store --environment`: specify which environments to connect (repeatable, e.g. `--environment production --environment preview`).
