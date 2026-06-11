---
'@vercel/backends': patch
---

Fix a `@vercel/backends` performance regression. Passing `stat`/`readlink`/`readFile` overrides to `nodeFileTrace` replaces @vercel/nft's internal `CachedFileSystem`, so repeated (mostly missing) path probes during module resolution became uncached syscalls that throw on every miss. The `stat`/`readlink` overrides are now only applied when there are in-memory rolldown output files to serve, and all fs overrides are memoized (including negative results) to restore nft's caching.