---
'@vercel/build-utils': patch
'vercel': patch
---

Scope the pre-compilation install's `VERCEL_INSTALL_COMPLETED` marker to the `package.json` it installed. Previously, a `vercel.toml`/`vercel.ts` config caused `vc build` to install at the repo root and then silently skip every later default install, so services whose install root is a different workspace (its own `package.json`/lockfile) built without dependencies.
