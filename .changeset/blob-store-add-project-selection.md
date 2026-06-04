---
'vercel': minor
---

feat(cli): add project selection to blob store add command

- `blob store add` now prompts to select a project during store creation, sending `projectId` in the API request body.
- New `--project <id-or-name>` flag to specify the project non-interactively (required in CI/non-TTY environments).
- When not linked to a project, prompts for org scope via `selectOrg`.
- For accounts with >100 projects, falls back to text input with post-submit validation.
