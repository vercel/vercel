---
'@vercel/build-utils': minor
'@vercel/node': patch
'@vercel/remix-builder': patch
'@vercel/redwood': patch
'@vercel/hydrogen': patch
'@vercel/backends': patch
'@vercel/static-build': patch
'@vercel/next': patch
'@vercel/python': patch
---

Mark where installing dependencies and building start in the build log when the build container sets `VERCEL_BUILD_STEP_MARKERS=1`, so it can split the log into steps.
