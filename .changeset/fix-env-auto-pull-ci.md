---
'vercel': patch
---

Fix environment variable auto-pull during project linking to not interfere with explicit environment targeting.

- `vercel pull --environment=X` no longer auto-pulls development env vars during linking
- Skip env pull prompt in non-TTY environments (CI) during `vercel link`
