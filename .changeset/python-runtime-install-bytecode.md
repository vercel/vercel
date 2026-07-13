---
'@vercel/python': minor
---

Bytecode-first packing for runtime-dependency-install builds (>225 MB) when `VERCEL_PYTHON_COMPILEALL` is enabled.

The zip bundles only the mandatory packages plus a `sys.pycache_prefix` bytecode tree covering the app and all dependencies including those installed into `/tmp` at cold start, and defers every other public package to the cold-start `uv sync`. Falls back to knapsack packing (now with a slack-capacity bytecode fill) when the externalized set would not fit Lambda ephemeral storage.
