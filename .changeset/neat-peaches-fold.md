---
'@vercel/static-build': patch
---

When TanStack Start uses the default `vite build` script and `nitro` is not declared, install Nitro into the project directory and run the local `./node_modules/.bin/nitro` binary so `vite` resolves from the project's `node_modules` instead of an isolated `npx` cache.
