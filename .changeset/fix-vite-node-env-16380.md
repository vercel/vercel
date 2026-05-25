---
'@vercel/static-build': patch
---

Fix `import.meta.env.DEV=true` in production Vite bundles (#16380). Vite's `resolveConfig()` defaults `NODE_ENV` to `"development"` when no mode is set, which leaked into subsequent `vite build` invocations and caused production bundles to embed development-only code paths. The fix passes `mode: 'production'` to `resolveConfig` and saves/restores `process.env.NODE_ENV` around the call.
