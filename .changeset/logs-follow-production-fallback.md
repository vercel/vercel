---
'vercel': patch
---

`vercel logs --follow` now resolves a deployment automatically instead of erroring. When no deployment is specified it follows, in order: the latest deployment on the current git branch (using the provider-agnostic `branch` filter, which also matches deployments from unrecognized git remotes), your latest deployment, then the latest production deployment. `--environment production` streams the latest production deployment directly, and `--environment preview` restricts resolution to preview deployments.
