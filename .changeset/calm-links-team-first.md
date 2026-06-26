---
'vercel': patch
---

Ask interactive `vercel link` users to choose a team before project discovery,
add searchable team and existing-project pickers, and allow Escape to cancel
prompts cleanly. After team selection, the project picker prioritizes projects
linked to the local Git repository with the matching Root Directory, then falls
back to an exact folder-name match before offering full project search or
project creation. Git matches persist the repository mapping in
`.vercel/repo.json`. The project-name prompt allows Up to return to the picker,
and project selection and search provide choices for returning to the previous
step. Explicit `--scope` and `--team` values skip the team prompt and restrict
project lookup to that team.
