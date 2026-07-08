---
'vercel': patch
---

Fixed `vercel upgrade` misdetecting pnpm 11 global installs as local npm installs. pnpm 11 moved global packages to isolated directories under `PNPM_HOME/global/v11/` backed by the global virtual store, which the previous detection did not recognize — causing the upgrade to run `npm i vercel@latest` in the current working directory (creating a stray `node_modules`) while reporting success without upgrading the real installation. Detection now recognizes installs running from inside `PNPM_HOME`, and no longer crashes when the entrypoint path cannot be resolved on disk.
