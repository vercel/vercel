---
'vercel': patch
---

Normalize a project Root Directory of `.` (or `./`) to "no root directory" when deploying, so `vercel deploy` no longer sends `projectSettings.rootDirectory: "."` for projects linked at the repository root.
