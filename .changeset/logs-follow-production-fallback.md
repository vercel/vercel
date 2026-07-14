---
'vercel': patch
---

Fall back to the latest production deployment when `vercel logs --follow` finds no deployments matching the current git branch, instead of erroring. Deployments created without git metadata (e.g. CLI or API deploys from repos without a recognized git remote) never match the branch lookup, which previously made `logs --follow` fail even when production deployments existed.
