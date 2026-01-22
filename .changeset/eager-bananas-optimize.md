---
'@vercel/build-utils': patch
---

Optimize `getAvailableNodeVersions` to skip discontinued versions and use non-throwing `statSync`
