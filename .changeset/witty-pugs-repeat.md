---
'vercel': patch
---

Fix `vercel upgrade` for pnpm installs: pnpm v10+ requires approval to run dependency build scripts (e.g. esbuild's postinstall) and would either skip them or wait on an invisible prompt. The upgrade command now pre-approves the required build script for that single install via `--allow-build`, and stdin is detached so the installer can never block on a hidden prompt.
