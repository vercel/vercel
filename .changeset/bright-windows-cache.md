---
'@vercel/build-utils': patch
'@vercel/functions': patch
'@vercel/next': patch
---

Prevented unit tests and generated outputs from changing Turborepo task inputs during CI, and removed the redundant affected Unit test retry.
