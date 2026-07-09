---
'vercel': major
---

Every command that establishes a link — `vercel deploy`, `vercel pull`,
`vercel dev`, `vercel git connect`, and `vercel link` itself — now uses the
same flow: resolve the team first (explicit `--scope`/`--team`,
`vercel.json` `scope`, `VERCEL_ORG_ID`, a single available team, or the
searchable team picker), then offer project suggestions scoped to that team,
preferring projects linked to the local Git repository (which produce a
repo-style `.vercel/repo.json` link) over folder-name matches. The
cross-team project sweep and its SSO fallback prompt are removed entirely;
project discovery never queries teams other than the one that was resolved.
An explicit project name (`--project`, `--name`, or `vercel.json` `name`)
skips the suggestions and resolves directly within the team. An explicit
team signal now also skips the team prompt in every command, not just
`vercel link`.
