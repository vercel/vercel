---
'@vercel/backends': patch
---

Fix build failure when `outputDirectory` is set to the project root (e.g. `.`). The builder no longer globs the working tree as build output in that case, avoiding tracing errors from package-manager symlinks in `node_modules`.
