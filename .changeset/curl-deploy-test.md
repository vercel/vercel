---
'vercel': patch
---

Decouple first-deployment framework detection from `VERCEL_FRAMEWORK_DETECTION`. First-deployment detection (auto-detecting the framework for a project's first deployment when none is configured) is now driven solely by `VERCEL_FIRST_DEPLOYMENT`; `VERCEL_FRAMEWORK_DETECTION` continues to gate only the end-of-build framework cross-check.

Also adds a curl-based CLI e2e test (`packages/cli/test/e2e-curl-deploy.test.ts`) that uploads a zipped Node project to `/v2/files`, creates a deployment via `/v13/deployments`, waits for it to be READY, probes `/` for the expected response, and deletes the created project.
