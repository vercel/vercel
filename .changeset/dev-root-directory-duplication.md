---
"vercel": patch
---

Fix `vercel dev` double-appending `rootDirectory` when run from inside a project subdirectory whose name already matches the project's `rootDirectory` setting (e.g. `monorepo/project1` → `monorepo/project1/project1`).
