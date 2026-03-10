---
'@vercel/build-utils': patch
---

Fix EEXIST error when using `--standalone` flag in monorepos by handling pre-existing symlinks in the shared output directory.
