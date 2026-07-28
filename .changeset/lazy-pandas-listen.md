---
'vercel': minor
---

`vercel build` now resolves Project Settings and Environment Variables from the API when the project is linked, instead of prompting to run `vercel pull` first. A local `.vercel/project.json` / `.vercel/.env.<target>.local` still takes precedence, so offline and deliberately pulled builds are unchanged. The post-link "Pull development environment variables into .env.local?" prompt has also been removed.
