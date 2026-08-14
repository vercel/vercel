---
'@vercel/python-analysis': minor
'@vercel/python': minor
---

Rank precompiled bytecode by cold-start value instead of size. On every bytecode fill path (standard, runtime-install knapsack, bytecode-first, large functions), when `.pyc` files overflow the zip's fill capacity, selection is now per file: bytecode for modules the app actually imports at startup first (from a new static AST import closure in `@vercel/python-analysis` — no user code runs at build time), ranked by measured compile cost per byte, then everything else by the same ranking. Compile timings are now measured per file during `compileall`. Falls back to density-only, then per-file size ordering, so no build is worse than the old per-package size knapsack. When all bytecode fits, everything ships with no analysis. The import closure is bounded by a 30s timeout, and setting `VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS=1` disables the closure and timing-based ranking entirely, reverting selection to per-file size ordering.
