---
'vercel': patch
---

Improve the `vercel flags` workflow with new `flags open` and `flags update` commands, richer string/number variant creation, and more detailed `flags inspect` and creation output that shows the exact variants and environment behavior. Boolean flags now default to development-only on creation, and the `enable`, `disable`, `archive`, and `rm` flows have clearer confirmations, default messages, and non-interactive guidance for scripts and agents.
