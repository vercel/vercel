---
'vercel': patch
---

Ask interactive `vercel link` users to choose a team before project discovery,
add searchable team and existing-project pickers, and allow Escape to cancel
prompts cleanly. The project picker prioritizes exact folder-name matches before
offering full project search or project creation, and the project-name prompt
allows Up to return to the picker. Project selection and search also provide
choices for returning to the previous step. Explicit `--scope` and `--team`
values skip the team prompt and restrict project lookup to that team.
