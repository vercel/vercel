---
'vercel': patch
---

Fixed orphaned domain alias remaining after project deletion by checking for and removing the alias when deleting a domain via `vercel domains rm`.
