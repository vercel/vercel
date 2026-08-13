---
'vercel': patch
---

Offer to link the project inline when `vercel env pull` runs in an unlinked directory, instead of requiring a separate `vercel link` run. Non-interactive sessions (no TTY, `--yes`, or `--non-interactive`) keep failing with the existing error.
