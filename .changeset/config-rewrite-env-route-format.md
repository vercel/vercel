---
"@vercel/config": patch
---

Fix `routes.rewrite()` and `routes.redirect()` to return Route-format objects (`{ src, dest, env }`) instead of Rewrite/Redirect-format objects (`{ source, destination, env }`) when the destination contains `deploymentEnv()` values. The `env` field requires the `routes` format and is rejected by the build system when placed in the `rewrites` or `redirects` config arrays. Fixes #15031.
