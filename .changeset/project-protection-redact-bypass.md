---
'vercel': major
---

`vercel project protection status` (and bare `vercel project protection`) no longer prints protection bypass secrets. The `protectionBypass` field is removed from `--json` output and replaced with `protectionBypassSecrets`, which lists each secret's `scope`, `createdAt`, `createdBy`, and integration IDs without the secret value. Get bypass secret values from the project's Deployment Protection settings in the dashboard.
