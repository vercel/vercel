---
'vercel': patch
---

fix(cli): prefer team over personal account when `--scope` slug is ambiguous

When a personal account username and a team slug are identical, `--scope <slug>` now resolves to the team instead of erroring with "You cannot set your Personal Account as the scope." This fixes both the global `--scope` flag and `vercel teams switch <slug>`.
