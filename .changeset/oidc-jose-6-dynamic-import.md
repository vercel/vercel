---
'@vercel/oidc': patch
---

Upgrade `jose` to `^6.2.5` and load it with a dynamic `import()` so that `@vercel/oidc` works in runtimes where `require()` of an ES module is unavailable (such as `nodejs24.x` on Vercel).

Bundler note: `jose` v6 is ESM-only, so it must be loaded with a native `import()`. esbuild keeps `import('jose')` as written, but webpack 5 rewrites it to `require('jose')` when `jose` is externalized (`target: 'node'` + `externals`), which fails with `ERR_REQUIRE_ESM` on runtimes without `require(esm)`. If you bundle `@vercel/oidc` with webpack, do not externalize `jose` (let webpack bundle it), or use an esbuild-based bundling path.
