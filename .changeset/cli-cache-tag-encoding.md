---
'vercel': patch
---

Send cache tags as an array instead of a comma-separated string in `cache invalidate` and `cache dangerously-delete` CLI commands, encoding commas with `!` for consistency with `@vercel/functions`.
