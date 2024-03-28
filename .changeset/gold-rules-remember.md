---
'@vercel/node': patch
---

Fix requests failing due to the presence of `Transfer-Encoding` header in edge-function dev server.
