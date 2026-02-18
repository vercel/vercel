---
'vercel': patch
---

Patches the experimental embedding of flag definitions.

The changed functionality is only enabled when the `VERCEL_EXPERIMENTAL_EMBED_FLAG_DEFINITIONS`  environment variable is set. The existing `@vercel/flags-core` library is already forwards-compatible with the new format.

Adds a new `vercel flags prepare` command to prepare flag definitions for embedding. It is not necessary to run this command manually, as it is automatically invoked during the build process on Vercel. Only call this if you are building outside of Vercel.

See [https://vercel.com/docs/flags/vercel-flags/sdks/core#embedded-definitions](https://vercel.com/docs/flags/vercel-flags/sdks/core#embedded-definitions).