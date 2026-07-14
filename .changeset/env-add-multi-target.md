---
'vercel': minor
---

`vercel env add` now accepts a comma-separated list of environments to create a single Environment Variable entry spanning multiple targets, e.g. `vercel env add API_URL production,preview,development`. Invalid environment names fail locally with a clear error (`invalid_environment` in non-interactive mode), custom Environment slugs are resolved to ids, and a Git branch is rejected unless Preview is the only target. Non-interactive `missing_environment`, `missing_requirements`, and sensitivity-conflict payloads now suggest the multi-target command form.
