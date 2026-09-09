---
'vercel': patch
---

Fix `vercel env rm <name> <environment>` silently deleting variables from all environments when the record targets multiple. Now only the specified environment is removed (via PATCH) instead of the entire record being deleted (via DELETE).
