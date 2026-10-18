---
'vercel': minor
'@vercel/oidc': patch
---

Accept `teamId` as an alias for `orgId` in `.vercel/project.json` and `.vercel/repo.json`, and `VERCEL_TEAM_ID` as an alias for `VERCEL_ORG_ID`. `vercel dev` now also exposes `VERCEL_TEAM_ID` when the linked project is owned by a team.
