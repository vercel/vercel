---
'@vercel/build-utils': patch
---

Add pnpm 11 support. Projects created after 2026-04-28 (the pnpm 11.0.0 release date) with a `pnpm-lock.yaml` at lockfile version 9.0 now resolve to pnpm 11; older projects continue to resolve to pnpm 10 or pnpm 9. `package.json#packageManager` and corepack can still opt any project into a specific major.
