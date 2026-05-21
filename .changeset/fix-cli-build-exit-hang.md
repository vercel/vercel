---
'vercel': patch
---

Fix `vc build` hanging on exit by destroying the keep-alive HTTPS agent and unref'ing any remaining handles before the process exits. Pooled idle sockets from the keep-alive agent were keeping the event loop alive after the build completed.
