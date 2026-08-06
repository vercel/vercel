---
'vercel': patch
---

Improve the error shown when the first argument is neither a known command nor an existing directory. Instead of falling back to `vercel deploy` and failing with a confusing path error like "Could not find" or "Can't deploy more than one path", the CLI now explains that the token is not a vercel command, that no matching directory exists to deploy, and points to `vercel help`.
