---
'@vercel/fs-detectors': patch
'@vercel/routing-utils': patch
'vercel': patch
---

Move shared service route ownership helpers into `@vercel/routing-utils` and
reuse them from both services detection and CLI route scoping. This centralizes
ownership-guard logic while preserving service boundary behavior.
