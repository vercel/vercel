---
'vercel': patch
---

Fix environment variable auto-pull during project linking to not interfere with explicit environment targeting.

- `vercel pull --environment=X` no longer auto-pulls development env vars during linking
- Added `--no-env-pull` flag to `vercel link` to disable auto env pull (useful for CI)
