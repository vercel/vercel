---
'vercel': patch
---

Native binary builds now embed a pinned `builders` manifest in the staged package.json. Previously the binary shipped without any `builders` pins, so `importBuilders` installed builders from npm `latest` instead of the versions the CLI was released with.

The native binary now resolves Builders exclusively from the Builders directory (no fallback to CLI-bundled dependencies), and the directory is configurable via `VERCEL_BUILDERS_DIR` (default: `.vercel/builders` in the project). Builder installs respect project and user npm settings, including minimum release age. If npm rejects a CLI-pinned Builder version, the CLI warns and retries the original bare Builder spec so npm can select an allowed version.
