---
'vercel': patch
---

Allow `.vercel/repo.json` to hold links from multiple teams. Linking a directory no longer evicts another team's project at the same directory (same-team entries at the same directory are still replaced), entries record the team slug for display, project selection prompts qualify names with the team when entries span multiple teams, and `--project` name matches are disambiguated by the current team scope.
