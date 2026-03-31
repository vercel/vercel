---
'vercel': patch
---

Improve `vercel microfrontends create-group` non-interactive behavior by allowing free-tier-safe flows with explicit flags, while still blocking non-interactive execution when the action would impact billing. Add support for repeatable `--project-route=<project>=<route>` to configure non-default project routes without prompts.
