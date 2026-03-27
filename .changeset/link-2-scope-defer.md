---
'vercel': patch
---

`link-2`: ask for team/scope only when creating a new project, not at the start of the flow. After linking, default to not pulling env vars; when pulling interactively with multiple projects, use a checkbox to choose which apps to pull for (`--yes` still pulls for all linked projects).
