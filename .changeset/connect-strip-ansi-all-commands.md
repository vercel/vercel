---
'vercel': patch
---

Strip ANSI escape sequences from team-controlled connector names, UIDs, and project names in all `vercel connect` command output (`attach`, `detach`, `remove`, `revoke-tokens`, and the `list` table's type/projects cells), not just the `list` UID/name cells. Prevents terminal escape injection from maliciously-named connectors visible across a team.
