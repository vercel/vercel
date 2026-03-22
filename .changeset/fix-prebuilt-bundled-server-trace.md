---
"@vercel/next": patch
---

fix(next): merge next-minimal-server.js.nft.json into server trace for prebuilt deployments

When using prebuilt deployments (`vercel build` + `vercel deploy --prebuilt`) with
Turbopack and the Pages Router, vendored context files required by `require-hook.js`
at runtime were missing from the serverless function bundle because `next-server.js.nft.json`
does not trace runtime-rewritten module paths.

This fix merges `next-minimal-server.js.nft.json` (which correctly includes all
vendored context files) into the server trace when it exists, without requiring the
internal `VERCEL_NEXT_BUNDLED_SERVER=1` environment variable.

Fixes vercel/vercel#15654
