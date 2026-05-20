---
'vercel': minor
---

Add `--project <NAME_OR_ID>` flag to `build`, `deploy`, `pull`, and `dev` for non-interactive CI/CD and agent-driven use.

When `--project` is provided, the CLI will:

- Disambiguate monorepo `.vercel/repo.json` linked projects without prompting (matches by name **or** ID)
- Resolve the project via the API when no local link is present
- Fail fast with a clean "Project ... was not found" error if the value cannot be resolved (never silently creates a new project)
- In non-interactive contexts (CI, agents) the same failure also emits a structured JSON payload with a `next` array of suggested follow-up commands.

This is particularly important for agents (which run non-interactively by default): they can now target a specific project in monorepos and unlinked directories without relying on interactive setup prompts or the project picker.

The flag is also accepted on `vercel deploy init` (excluded on `vercel deploy continue` because `--id` already identifies the deployment).

The new API-based resolution is opt-in via the explicit `--project` flag, so commands like `vercel deploy` in an unlinked directory keep their existing behavior of falling back to interactive setup.
