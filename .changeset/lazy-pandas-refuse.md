---
'@vercel/python': patch
---

Always run bytecode precompilation when `VERCEL_PYTHON_COMPILEALL` is enabled, removing the coverage-ratio heuristic that skipped compiles when the estimated bytecode would not sufficiently fit the remaining zip capacity.
