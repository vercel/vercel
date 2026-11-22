---
"@vercel/next": patch
---

Fix post-build validation for multi-segment Root Directory values (e.g. `clients/admin-ui`). The `relativeAppDir` field from the `required-server-files.json` manifest was resolved against the repo root (`baseDir`), but Next.js 16 computes it relative to the detected monorepo/workspace root, causing intermediate path segments to be dropped (e.g. `/vercel/path0/admin-ui` instead of `/vercel/path0/clients/admin-ui`). The builder now verifies the resolved path exists on disk and falls back to the absolute `appDir` or `entryPath` when it doesn't. Fixes #15937.
