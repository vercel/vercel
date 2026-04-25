---
'vercel': minor
---

Add `vercel connex remove` command to delete a Connex client by id or uid. Refuses when projects are connected unless `--disconnect-all` is passed (mirrors `vercel integration-resource remove`); supports `--yes` and `--format=json`.
