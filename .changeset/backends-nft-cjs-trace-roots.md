---
'@vercel/backends': patch
---

Trace runtime dependencies from rolldown's output chunks rather than TypeScript source files. NFT picks the `require` vs `import` exports condition based on the parent file's parse result, so source-driven tracing miscategorises packages whose conditional exports point at different files (e.g. `@planetscale/database` -> `dist/index.js` for `import`, `dist/cjs/index.js` for `require`). A CJS bundle that did `require('@planetscale/database')` at runtime would fail with `Cannot find module` because the CJS variant was never traced or uploaded.
