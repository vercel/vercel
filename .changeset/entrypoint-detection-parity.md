---
'@vercel/backends': patch
---

Align entrypoint detection with the framework wrapper builders as a permissive union: framework-import-gated well-known filenames win over `package.json#main`, NestJS prefers `src/main`, `koa` is recognized, `outputDirectory` is searched first when configured, and error messages match the wrapper builders. Historical backends behaviors are kept where they accept more projects (`main` without a framework import, `main`/`src/main` filenames for all frameworks, fallthrough to the source tree when the output directory has no entrypoint).
