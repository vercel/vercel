---
'@vercel/python': patch
---

Reduce Python function bundle size by stripping DWARF debug symbols from native shared libraries (`.so`) with `strip --strip-debug`. `--strip-debug` removes only debug sections and leaves all symbol tables intact, so it cannot change runtime behavior and preserves symbol names in native crash backtraces. Debug stripping is enabled by default and can be disabled with `VERCEL_PYTHON_STRIP_DEBUG=0`; it is skipped for cross-architecture builds when no compatible strip tool is available. Also prunes the inert `REQUESTED` installer marker, which no runtime API reads.
