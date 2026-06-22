---
'vercel': patch
---

Allow Escape to cancel interactive `vercel link` prompts cleanly, add searchable
existing-project selection for teams with more than 100 projects, and refresh
`VERCEL_OIDC_TOKEN` after every successful project link without changing other
`.env.local` entries. The post-SSO fallback team selection now supports
substring search by team name or slug.
