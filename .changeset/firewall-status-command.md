---
'vercel': minor
---

Add `vercel firewall status`, showing firewall configuration in execution order — bypass, system mitigations, attack mode, IP blocks, rules, and managed rulesets. `--json` additionally reports the pipeline as ordered data and a `bypassUnavailable` field explaining why `bypass` is `null`. `firewall overview` now renders the same block, so it reports managed rulesets too, and its rows use the shared aligned-label layout.
