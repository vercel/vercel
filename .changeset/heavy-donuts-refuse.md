---
'vercel': patch
---

Detach the background update-check worker from the terminal so it no longer resets the parent CLI's raw mode on exit, which caused interactive prompts (e.g. the coding agents selector) to break and echo arrow keys as `^[[A`/`^[[B`
