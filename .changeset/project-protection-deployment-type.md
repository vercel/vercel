---
'vercel': minor
---

Improve `vercel project protection`:

- Rename `--sso` to `--vercel-authentication` and `--password` to `--password-protection`. The old names still work and print a deprecation warning (in `--json`, the warning goes in `warnings`).
- Add `--deployment-type <standard|all|preview|legacy-standard>` to `enable` so you can choose which deployments Vercel Authentication or Password Protection covers. Without it, `enable` keeps its current default (`legacy-standard`).
- Add `vercel project protection status`. Bare `vercel project protection` still works.
- Show coverage in plain language, and warn when `enable` replaces a different existing setting.
