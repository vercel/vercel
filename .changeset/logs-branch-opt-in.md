---
'vercel': minor
---

`vc logs` now displays request logs from all branches by default. Use `--branch <name>` to filter by branch. To preserve the previous behavior, pass the current branch name explicitly.

`vc logs --follow` now streams the latest READY production deployment by default. If none exists, it falls back to your latest READY deployment. Use `--environment preview`, `--branch <name>`, or a deployment URL or ID to select another deployment.

With `--follow`, `--branch` and `--environment` filter the deployment together. If no READY deployment matches both filters, the command returns an error instead of falling back to another branch or environment.

The deprecated `--no-branch` flag remains accepted as a no-op.
