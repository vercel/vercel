---
'vercel': patch
---

Align `repo.json` and `.vercel/project.json`: prefer repo mapping for `rootDirectory` when reading pulled settings, resolve stale per-directory links against the repository config, and always persist project ids when writing pulled settings.
