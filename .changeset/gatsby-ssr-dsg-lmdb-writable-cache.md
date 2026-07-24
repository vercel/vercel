---
'@vercel/gatsby-plugin-vercel-builder': patch
---

Fix Gatsby SSR/DSG routes crashing with `ENOENT: ... mkdir '.../.cache/caches-lmdb'` on the read-only function filesystem. Gatsby opens additional LMDB instances (the `caches-lmdb` query/resolver cache and `gatsby-core-utils` storage) lazily at request time, pathed off `global.__GATSBY.root` (Gatsby >= 5.13) or `process.cwd()`. The SSR handler now points those at the OS temp dir before the query engine is imported, mirroring the existing datastore handling.
