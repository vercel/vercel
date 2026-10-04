---
'vercel': patch
---

Fall back to copying deduplicated function directories when `vercel build` cannot create symlinks on Windows (`EPERM` without Developer Mode).
