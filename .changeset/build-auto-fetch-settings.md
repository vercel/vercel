---
'vercel': patch
---

`vc build` now fetches project settings and environment variables from the API when not available locally, removing the interactive prompt to run `vc pull` first.
