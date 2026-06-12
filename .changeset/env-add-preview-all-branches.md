---
'vercel': patch
---

Fix non-interactive `env add <name> preview --value <value> --yes` looping on `git_branch_required`. The branch-prompt fallback now honors the same "two positionals = all Preview branches" convention as the validation block, so the suggested "Add to all Preview branches" retry command actually succeeds instead of returning the same action_required error.
