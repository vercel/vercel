---
'vercel': patch
---

Fix `vc link` sometimes prompting to select a repo-linked Project twice and ensure `env pull` uses the newly linked `.vercel/project.json` instead of falling back to `.vercel/repo.json`.

