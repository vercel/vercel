---
'vercel': patch
---

Track `marketplace_checkout_provisioning_started` in `vercel integration add` only when the server does not hand the run to the browser, so fallbacks such as `no_eligible_plan` and `preauthorization_required` no longer count as started provisioning.
