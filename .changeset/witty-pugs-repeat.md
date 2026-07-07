---
'vercel': patch
---

Fix `vercel upgrade` on pnpm installs: pnpm v10+ requires approval to run dependency build scripts (e.g. esbuild's postinstall) and would prompt or skip them during the upgrade. Global pnpm upgrade commands now pre-approve the required build script via `--allow-build`, which applies to that single install only and persists no policy.
