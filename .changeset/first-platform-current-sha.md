---
'vercel': patch
---

Flip the PR binary `current-sha` pointer after the first platform uploads, report the installed Git commit separately from the binary checksum, and tell `vercel version use pr/N` when this SHA exists but this platform is not ready yet.
