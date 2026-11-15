---
'vercel': minor
---

Add `--deployment-type <standard|all|preview|legacy-standard>` to `vercel project protection enable --sso|--password` so you can choose which deployments Vercel Authentication or Password Protection covers. Add `vercel project protection status`, show coverage in plain language, and warn when `enable` replaces a different existing setting. Bare `enable --sso` keeps its current default.
