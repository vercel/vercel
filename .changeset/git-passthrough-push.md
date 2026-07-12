---
'@vercel/cli': minor
---

Add `vc git` passthrough with push-aware deployment tracking.

- `vc git <any git args>` now runs git as passthrough from the CLI, preserving exit code and stdio.
- `vc git push` (and variants) detects the push, resolves all Vercel projects linked via `.vercel/repo.json` (repo-root discovery works from any subdir), and polls for new git-triggered deployments.
- Shows deployment links for all projects that started a deployment; shows "no new deployment" for those ignored by git config.
- Streams build logs only for the project whose `rootDirectory` contains the current cwd (deepest match), matching `vc deploy` output via `printDeploymentStatus` and `displayBuildLogs`. Other projects only show links.
- Adds wrapper flags: `--no-attach` to skip polling, `--logs`/`-l` to force logs for cwd project, `--no-logs` to disable.
- Updates telemetry and help snapshots, and adapts git command tests for passthrough behavior.
