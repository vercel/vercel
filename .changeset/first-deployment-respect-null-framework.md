---
'vercel': patch
---

Respect an explicit "no framework" opt-out in first-deployment framework detection.

Previously `detectFirstDeploymentFramework` used a truthiness check, which treated `null` (an explicit "no framework" choice persisted by the API) the same as `undefined` (an absent framework). On a first deployment it would run detection and overwrite a `null` opt-out with whatever it detected from source.

The guard now distinguishes the three states: a string slug and `null` are both considered "configured" and skip detection; only a genuinely absent (`undefined`) framework triggers detection. The API persists `null` when a user selects "no framework", and that value survives the `.vercel/project.json` JSON round-trip, so the distinction is reliable end-to-end. Build telemetry now preserves the `null` vs `undefined` distinction as well.
