---
'@vercel/node': patch
---

Skip copying the ts test fixture types file during build when the test
fixtures directory is not present (e.g. tarball deployments where
`.vercelignore` excludes `test/**`).
