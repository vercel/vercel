---
---

Add a curl-based e2e test that uploads a zipped Node project to `/v2/files`, creates a deployment via `/v13/deployments`, waits for it to be READY, probes `/` for the expected response, and deletes the created project.
