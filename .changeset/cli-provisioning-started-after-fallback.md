---
'vercel': patch
---

Track `marketplace_checkout_provisioning_started` in `vercel integration add` only for provisioning attempts, so browser fallbacks decided before provisioning, such as `no_eligible_plan` and `preauthorization_required`, no longer count as started. A fallback with `reason: 'error'` now also tracks `marketplace_checkout_provisioning_failed`.
