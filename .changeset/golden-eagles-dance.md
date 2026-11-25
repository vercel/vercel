---
'@vercel/oidc': minor
---

Add ESM build (.mjs) for the `import` and `edge-light` `import` conditions, for compatibility with ESM bundlers (esbuild, Rollup, Vite, etc.).

Note: `import` consumers now receive a native ES module, so the synthetic default export that Node provided for the previous CommonJS target is no longer available; use named imports (`import { getVercelOidcToken } from '@vercel/oidc'`). The ESM entry also named-imports `@vercel/cli-config` and `@vercel/cli-exec`, which are CommonJS packages.
