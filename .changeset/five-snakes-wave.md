---
'@vercel/frameworks': patch
'@vercel/static-build': patch
---

Detect TanStack Start projects without requiring a top-level `nitro` dependency by matching Start packages directly, and make static builds fall back to `npx nitro build --builder vite` when TanStack Start SSR is enabled via the default `vite build` script.
