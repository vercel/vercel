---
'vercel': patch
---

For `vercel link --repo`, omit existing Vercel projects that are not linked to this Git repository from the selection list (use `vercel link add` to connect them); skip the redundant post-summary confirmation when the summary is shown. Projects already in `repo.json` stay selected and show as “Already linked”; a single such row exits without confirming or rewriting `repo.json`. `vercel link add` is unchanged.
