---
'@vercel/build-utils': minor
'@vercel/node': patch
'@vercel/rust': patch
---

Verify SHA-256 of downloaded toolchain archives before extracting or executing them. Adds a shared `VerifiedDownloader` class and `extractZip` helper to `@vercel/build-utils`.
