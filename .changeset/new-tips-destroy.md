---
'vercel': patch
---

Patches the experimental embedding of flag definitions.

The changed functionality is enabled by setting the environment variable `VERCEL_EXPERIMENTAL_EMBED_FLAG_DEFINITIONS`.

The `@vercel/flags-core` library consuming these definitions is already forwards-compatible with the new format.

See https://vercel.com/docs/flags/vercel-flags/sdks/core#embedded-definitions
