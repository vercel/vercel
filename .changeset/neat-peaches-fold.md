---
'@vercel/static-build': patch
---

When TanStack Start uses the default `vite build` script and `nitro` is not declared, install `nitro-nightly` (`nitro@npm:nitro-nightly@latest`) into the project directory and run `./node_modules/.bin/nitro build --builder vite` so the nightly `--builder` support is used with the project's `node_modules`.
