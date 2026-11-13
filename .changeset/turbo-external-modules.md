---
'@vercel/next': patch
---

Fix serverless functions crashing at runtime on Next.js 16.2+ when built with
Turbopack, with errors like:

```
Error: Cannot find module 'next/dist/server/lib/incremental-cache/tags-manifest.external.js'
```

Next.js's Turbopack-compiled runtimes (`app-route-turbo.runtime.prod.js`,
`app-page-turbo.runtime.prod.js`) load `*.external.js` modules through
Turbopack's `externalRequire`, which neither `@vercel/nft` nor Next.js's own
build-time trace can see statically. `@vercel/next` now explicitly includes
`next/dist/server/**/*.external.js` in the traced output for every Node.js
lambda, regardless of bundler, so these modules are always present at runtime.
