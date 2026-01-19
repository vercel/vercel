---
'@vercel/build-utils': patch
---

Add `findPackageJson` function for optimized package.json lookup without lockfile scanning. This improves `getNodeVersion` performance by avoiding unnecessary lockfile parsing.
