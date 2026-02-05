---
"vercel": patch
---

Migrate git config parsing to use git commands instead of parsing .git/config directly. This improves reliability when working with git worktrees and bare repositories.
