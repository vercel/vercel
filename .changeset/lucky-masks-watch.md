---
'vercel': patch
---

Fix `vercel env add <name> preview` so it no longer returns `git_branch_required` when `--yes`, `--force`, or non-interactive mode is used. In these cases, omitting the third argument now correctly targets all Preview branches.
