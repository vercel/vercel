---
'vercel': minor
---

`vercel build` now resolves Project Settings and Environment Variables from the API when the project is linked, instead of prompting to run `vercel pull` first.

Pulled env files now record what they were resolved for, so `vercel build` can tell whether a local file answers the request it is about to make. A file pulled for the same Environment and Git branch is used as-is; one pulled for a different Environment or branch is reported and the API is used instead. Files pulled by older CLI versions have no provenance recorded and are still trusted.

`vercel build` and `vercel pull` now accept the same environment selection options: `--target` and `--environment` are aliases of each other in both, and both accept `--git-branch`. Passing `--git-branch` without an explicit environment resolves the Preview Environment, since branch overrides only exist there.

The post-link "Pull development environment variables into .env.local?" prompt has been removed.
