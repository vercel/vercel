---
'vercel': patch
---

Restructure the `skills/vercel-cli` skill to stop hand-maintaining command syntax: reference files now contain only workflows, semantics, and gotchas, and delegate command/flag syntax to `vercel <command> --help`.
