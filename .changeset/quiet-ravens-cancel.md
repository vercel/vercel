---
'vercel': patch
'@vercel/cli-config': patch
---

Allow Escape to cancel interactive `vercel link` prompts cleanly, add searchable
existing-project selection, and refresh `VERCEL_OIDC_TOKEN` after every
successful project link without changing other `.env.local` entries.

Interactive linking now selects the team with searchable name/slug filtering
before project discovery. In
non-interactive mode, linking requires an explicit or authoritative
team-project target, never creates a project, and treats `--yes` as redundant
once the target is fully resolved. Teams explicitly selected with
`vercel switch` are recorded separately from login-inferred defaults.
