---
'vercel': patch
---

Improve `vercel domains add`: skip project/deployment configuration guidance when no project is provided, return a specific error explaining only apex domains can be added without a project, and treat a domain that is already assigned to the requested project as a success (verified via the project's domains when the API omits the conflicting project) instead of failing with an "assigned to another project" error. Also adds debug logging for project-assignment failures.
