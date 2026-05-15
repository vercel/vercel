---
'@vercel/static-build': patch
---

When TanStack Start uses the default `vite build` script and `nitro` is not declared, fall back to `npx nitro build --builder vite` and warn about the missing dependency.
