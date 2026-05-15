---
'@vercel/static-build': patch
---

When TanStack Start uses the default `vite build` script and `nitro` is not declared, run `npx --yes -p nitro@npm:nitro-nightly@latest nitro build --builder vite` so the nightly Nitro CLI is used for `--builder` support.
