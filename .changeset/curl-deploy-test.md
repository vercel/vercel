---
---

Add a curl-based CLI e2e test (`packages/cli/test/e2e-curl-deploy.test.ts`) that uploads a zipped Node project to `/v2/files`, creates a deployment via `/v13/deployments`, waits for it to be READY, probes `/` for the expected response, and deletes the created project.
