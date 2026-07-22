---
'vercel': patch
---

Added a notice when a project's first `vercel deploy` (without `--prod`) is assigned to production by the API. The notice explains that this is expected behavior for the first deployment and that future deployments will be preview deployments unless `--prod` is used. In non-interactive mode, the hint is included in the JSON payload and the "Promote to production" next command is omitted since the deployment is already production.
