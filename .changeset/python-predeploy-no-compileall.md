---
'@vercel/python': patch
---

Skip bytecode precompilation when a service has a `preDeployCommand`. Precompiled bytecode uses `--invalidation-mode unchecked-hash`, which trusts the `.pyc` without re-checking the source at import — safe only because build output is normally immutable. A `preDeployCommand` runs after the build and can rewrite source files, leaving the already-compiled bytecode stale so the old source is served at runtime. Precompilation is now disabled for such services so the pre-deploy changes take effect.
