---
'@vercel/static-build': patch
---

Avoid calling `vite.resolveConfig` before Nitro injection (TanStack Start plugins can hang the build). Use package/vite.config heuristics for the pre-build gate and disk-based post-build detection for known SSR layouts, with a timeout on `resolveConfig` when it is still needed.
