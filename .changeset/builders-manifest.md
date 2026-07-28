---
'vercel': patch
---

Replace the Builder `peerDependencies` with a `builders` manifest in package.json, pinned to exact workspace versions at pack time and used for Builder version resolution. Builders remain in `dependencies`.
