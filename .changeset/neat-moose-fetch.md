---
'vercel': minor
---

Emit Vercel Flags embedded definitions by default

When you deploy to Vercel, the build process fetches your latest flag definitions once at build time using the Vercel CLI and bundles them into the deployment.

This used to require opt-in by setting `VERCEL_EXPERIMENTAL_EMBED_FLAG_DEFINITIONS=1`, and has now been switched to be enabled by default. You can opt out by setting `VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING=1`.

Definitions are only fetched in case there is at least one environment variable containing a Vercel Flags SDK key.

[See docs](https://vercel.com/docs/flags/vercel-flags/sdks/core#embedded-definitions)
