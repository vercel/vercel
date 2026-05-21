---
'@vercel/static-build': patch
---

Avoid calling `vite.resolveConfig` in the TanStack SSR paths (plugins can hang with no log line). Use package/vite.config heuristics for the Nitro-injection gate, disk-only post-build detection (`dist/client` + `dist/server`), skip post-build mapping after Nitro injection, and clearer logs before NFT tracing.
