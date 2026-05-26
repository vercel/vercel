---
'@vercel/build-utils': patch
'@vercel/client': patch
'vercel': patch
---

Add support for `experimentalEnvironmentVariables` in `vercel.json` with validation during build, dev, and deploy. Strip the field from deployment API payloads until the platform schema includes it.
