---
'@vercel/build-utils': patch
---

Fix `bun install` silently discarding `bun.lock` files with `lockfileVersion: 2` (written by Bun >= 1.4). The install step now selects the Bun 1.4 binary whenever the lockfile requires it, mirroring how the pnpm version is already inferred from its lockfile version, instead of always running the container's default Bun 1.3.x install.
