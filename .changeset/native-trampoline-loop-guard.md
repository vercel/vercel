---
'vercel': patch
---

Fix an infinite launcher loop when `vercel` and `@vercel/vc-native` are both installed globally. The launcher no longer resolves a native binary when already running inside one (`VERCEL_VC_NATIVE=1`), and only resolves the native package from its own install tree, ignoring `NODE_PATH`.
