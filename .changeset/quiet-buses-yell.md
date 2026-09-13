---
'vercel': patch
---

Fix `vercel link --project <name>` silently creating a new project when the name does not match any existing project. It now errors with `Project "<name>" was not found in the current scope` instead.
