---
'vercel': patch
---

Preserve the selected team scope across re-authentication. `vercel login` no longer resets `currentTeam` to the default team when re-authenticating: the previous selection is kept when the authenticated user is still a member of that team, and only falls back to the default scope (with a warning) otherwise. `vercel teams switch` no longer hard-fails when the persisted team is stale (deleted or membership revoked), so it can always be used to switch away.
