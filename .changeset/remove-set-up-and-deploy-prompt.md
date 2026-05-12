---
'vercel': patch
---

Remove the redundant `Set up and deploy "/path"?` confirmation prompt from `vc`. The user already typed `vc` in this directory — the intent is implied. The path is still surfaced as a status line so the user can verify, and Ctrl-C remains the escape hatch. Cuts one prompt off the first-run flow.
