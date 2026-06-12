---
'vercel': patch
---

Fix `vercel env add <name> preview` in non-interactive mode failing with `git_branch_required` when no git branch argument is passed. Omitting the third argument now adds the variable to all Preview branches, matching the behavior the error's own suggested next command already described.
