---
'vercel': minor
---

`vercel curl`, `vercel httpstat`, and `vercel traces create` now resolve explicit `--deployment` targets without linking the current directory. Automation bypass secrets are only auto-created on the locally linked project (for both `--deployment` and positional URL targets), and credentials are never attached to a target that cannot be verified as belonging to the credential's project. Automatic bypass-token lookup failures keep the existing nonzero exit. Global CLI flags (long and short) before the command token no longer leak into curl arguments; curl's own `--version` is forwarded unchanged.
