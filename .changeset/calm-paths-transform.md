---
'@vercel/routing-utils': patch
'@vercel/build-utils': patch
'@vercel/client': patch
vercel: patch
---

Compile route sources explicitly marked with `srcSyntax: "path-to-regexp"` and their `request.path` templates while preserving regex routes by default.
