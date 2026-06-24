---
'vercel': patch
---

Improve `vercel domains add` when no project is provided: skip project/deployment configuration guidance, and return a specific error explaining that only apex domains can be added without a project (subdomains must pass a project).
