---
'vercel': patch
---

Fix `vercel env pull` (and `vercel link`) repeatedly appending a duplicate `.gitignore` entry when the existing file uses different line endings than the ones the CLI would otherwise write (e.g. a `.gitignore` with LF line endings on Windows). Existing entries are now compared after normalizing line endings.
