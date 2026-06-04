---
'vercel': patch
---

Fix the CLI self-upgrade prompt failing inside pnpm/yarn workspaces. The upgrade command is now derived from the CLI's actual install location by querying each package manager's global root, and global upgrades run from a neutral directory instead of the current project. Previously a global install could be misdetected as local, producing a bare `npm i vercel@latest` that ran inside the user's project and failed with `EUNSUPPORTEDPROTOCOL` on `workspace:*` dependencies.
