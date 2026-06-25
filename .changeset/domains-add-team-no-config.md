---
'vercel': patch
---

Improve `vercel domains add`: skip project/deployment configuration guidance when no project is provided, return a specific error explaining only apex domains can be added without a project, treat a domain already assigned to the requested project as a success instead of failing with an "assigned to another project" error, and point users to `vercel domains verify <domain>` for DNS configuration instead of printing hardcoded DNS records.
