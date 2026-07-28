---
'vercel': minor
---

`vc logs` no longer filters by the current git branch and shows all branches by default. Use `--branch <name>` to filter, or `--branch $(git branch --show-current)` for the previous default.

`vc logs --follow` no longer considers the current git branch when choosing a deployment. With no deployment, branch, or environment specified it now streams the latest production deployment, falling back to your latest READY deployment. To stream a preview you just deployed, pass the deployment URL that `vc deploy` prints, or use `--environment preview`.

`--branch` now composes with `--environment` under `--follow`, and errors if no READY deployment matches instead of silently falling back to a different deployment.

`--no-branch` is still accepted but no longer does anything.
