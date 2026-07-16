---
'vercel': patch
---

Fix `vercel domains add` sending the alias mutation under a stale ambient team scope. When run inside a directory linked to a project in another team, the command now resolves the local project link (like `vercel domains ls`) and scopes the domain/alias request to the linked team, so a same-name project in the ambient team can no longer be targeted by mistake.
