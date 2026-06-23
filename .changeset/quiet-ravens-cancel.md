---
'vercel': patch
---

Allow Escape to cancel interactive `vercel link` prompts cleanly, add searchable
existing-project selection, and refresh `VERCEL_OIDC_TOKEN` after every
successful project link without changing other `.env.local` entries.

Interactive linking now selects the team with searchable name/slug filtering
before a searchable existing-project picker. The default `vercel link` flow no
longer creates projects in either interactive or non-interactive mode. In
non-interactive mode, linking requires an
explicit team and project or an existing valid local link, treats `--yes` as
redundant, and requires user input instead of selecting defaults or list
results.
