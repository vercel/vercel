---
'vercel': minor
---

Updated `vercel alias` command to use the promote flow when aliasing to a production alias. When the target alias matches one of the project's configured production domains, the command now calls the promote API instead of directly assigning the alias, ensuring proper production deployment handling.
