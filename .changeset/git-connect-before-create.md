---
'vercel': patch
---

Ask to connect a detected Git repository before creating the project, so the question no longer appears after the project has already been created. Under `--yes` or non-interactive mode the `origin` remote is used without prompting instead of showing a remote picker.

Also detect the Git repository from subdirectories. Linking from `apps/web` previously found no `.git` and silently skipped the question, so the repository was never offered for connection.

Connecting a repository now always links the repo root as `.vercel/repo.json`, and records the Project's Root Directory relative to that root. Linking from `apps` and choosing `web` as the code directory stores `apps/web`, so Git-triggered builds and local deploys both resolve to the same directory. Declining the connection is unchanged: a per-directory `.vercel/project.json` is written and the Root Directory stays relative to the linked directory.
