---
'vercel': patch
---

Allow Escape to cancel interactive `vercel link` prompts cleanly, add searchable
existing-project selection, and refresh `VERCEL_OIDC_TOKEN` after every
successful project link without changing other `.env.local` entries.

Interactive linking now selects the team with searchable name/slug filtering
before a searchable existing-project picker. Interactive users can explicitly
choose and confirm creating a new project. Non-interactive linking never creates
a project: it requires an explicit team and project or an existing valid local
link, treats `--yes` as redundant, and requires user input instead of selecting
defaults or list results. Interactive prompts show the target directory and
provide explicit escape hatches when the intended team or project is not listed.
After team selection, projects matching the directory name are suggested first;
the complete project list remains available through an explicit searchable
option.
