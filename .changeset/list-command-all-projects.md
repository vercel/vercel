---
'vercel': minor
---

Add `--all` flag to `vercel ls` command and improve behavior when not linked to a project

- `vercel ls` no longer requires a linked project. When not linked, it now lists all deployments across all projects in the current scope
- Added `--all` flag to explicitly list deployments across all projects, even when linked to a specific project
- Added "Project" column to the deployment table output to show which project each deployment belongs to
- JSON output (`--format json`) is unchanged and continues to include the `name` field for project name
