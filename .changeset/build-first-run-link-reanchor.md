---
'vercel': patch
---

Fix `vc build` resolving the wrong work path when it establishes the project link itself (settings pulled mid-build). The link is now re-read after the pull so monorepo repo-root re-anchoring applies on the first run, not only subsequent ones.
