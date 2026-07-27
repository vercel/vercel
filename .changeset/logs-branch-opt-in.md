---
'vercel': minor
---

`vc logs` no longer filters by the current git branch, and `vc logs --follow` no longer prefers the current branch's deployment — matching the Vercel dashboard, which shows all branches by default.

- Use `--branch <name>` to filter strictly; `--follow` returns an error when no READY deployment matches. Use `--branch $(git branch --show-current)` to restore the previous default branch selection.
- With no deployment, branch, or environment specified, `--follow` now prefers the latest production deployment and falls back to your latest READY deployment. Use `--environment production` to require production, or use `--environment preview`, `--branch <name>`, or a deployment URL to select another deployment.
- `--no-branch` is still accepted but no longer does anything.
