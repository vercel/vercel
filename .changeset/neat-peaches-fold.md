---
'@vercel/static-build': patch
---

When TanStack Start uses the default `vite build` script and `nitro` is not declared, install `nitro@npm:nitro-nightly@latest` into the project and run `./node_modules/.bin/nitro build --builder vite` (not `npx -p`, so the CLI can resolve the `nitro` package name).
