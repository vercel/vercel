---
'vercel': patch
---

Fix the native trampoline resolving the native binary through `NODE_PATH`: `require.resolve()` consults `NODE_PATH` and the global folders even when `paths` is given, so the native package is now located with an explicit walk up this install's own `node_modules` tree
