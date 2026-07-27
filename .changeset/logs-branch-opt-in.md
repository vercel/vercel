---
'vercel': minor
---

`vc logs` no longer filters by the current git branch, and `vc logs --follow` no longer prefers the current branch's deployment — matching the Vercel dashboard, which shows all branches by default.

- Use `--branch <name>` to filter, or `--branch $(git branch --show-current)` to restore the previous behavior.
- With no deployment specified, `--follow` now streams the latest production deployment. Use `--environment preview`, `--branch <name>`, or a deployment URL to stream something else.
- `--no-branch` is still accepted but no longer does anything.
