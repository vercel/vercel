---
'vercel': patch
---

Fix `vercel dev` injecting the entire project env into every builder dev server. When a project was linked, `vercel dev` passed the full `Project` object (including `env`, an array of every environment variable across all branches) as `projectSettings`. That object is serialized into `VERCEL_DEV_CONFIG` and forked into each dev server's environment, so on projects with many branches it could exceed the OS environment-block limit and fail the fork with `E2BIG`. `vercel dev` now passes only the project settings, dropping the unused `env` and `latestDeployments` fields.
