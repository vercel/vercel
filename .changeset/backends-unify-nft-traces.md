---
'@vercel/backends': patch
---

Collapse the two NFT traces (one inside `rolldown()` for adjacent assets, one at the top level for node_modules) into a single trace from the rolldown output chunks. `preserveModules: true` keeps the output directory parallel to source, so `__dirname`-relative asset detection still works from the chunks. Drops the now-unused `localBuildFiles` tracking and the `ignoreNodeModules` branch in `nft.ts`.
