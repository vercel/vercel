---
'@vercel/node': patch
---

Only install deps using default package manager when not zero config, otherwise try to run the install command.
