---
'vercel': patch
---

Improve `vercel domains add`: skip project/deployment configuration guidance when no project is provided, return a specific error explaining only apex domains can be added without a project, and treat a domain already assigned to the requested project as a success instead of failing with an "assigned to another project" error. The API does not always include the conflicting project in the error, so the conflicting project is now resolved by querying the domain's current project assignment, which also restores `--force` moving a domain from another project.
