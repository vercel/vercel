---
'vercel': minor
---

Add `vercel integration billing-plans <integration>[/<product>]` to list an integration's billing plans: the ID to pass to `--billing-plan`, its type, whether it is free, and whether the current team can use it. Use `--json` for machine-readable output, and `--meta KEY=VALUE` for integrations that only list a product's plans once they know its metadata, such as its region. `vercel integration add --help` and billing plan errors from `vercel integration add` now point to it.
