---
'vercel': patch
---

Fix the native CLI binary crashing on auth commands (`login`, `whoami`, `logout`, and any
command that reads config) with `ERR_MODULE_NOT_FOUND: '@vercel/cli-auth'`. The package is now
staged into the binary. The binary release is also hardened with a real command smoke test and a
build-time check that every statically-imported dependency is bundled, so a binary missing a
required package can no longer be released.
