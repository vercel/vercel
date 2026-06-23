---
'@vercel/backends': patch
---

Fix build crash when `outputDirectory` is `.` in a monorepo. Reusing the project root as the build output globbed the entire working tree (including `node_modules`), pulling package-manager symlinks (e.g. a pnpm workspace dependency linked under `node_modules`) into file tracing and failing with `File <path> does not exist.`. When `outputDirectory` resolves to the working directory itself, the builder now falls back to the rolldown bundle instead of globbing the project root.
