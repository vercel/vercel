---
'@vercel/static-build': patch
---

When TanStack Start uses the default `vite build` script and `nitro` is not declared, install Nitro into the project (and `vite` when missing) and run `nitro build --builder vite` instead of using isolated `npx`.
