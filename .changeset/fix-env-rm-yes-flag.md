---
'vercel': patch
---

Fixed `vercel env rm --yes` to work in non-TTY environments (e.g., CI) by also bypassing the HTTP-level DELETE confirmation prompt introduced in v50.9.0.
