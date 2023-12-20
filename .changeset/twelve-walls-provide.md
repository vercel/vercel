---
'@vercel/next': patch
---

Entries in the `prerender-manifest.json` without a `dataRoute` but with a `prefetchDataRoute` will be treated as an App Page. App Route's that do not have
a body will not cause a build error.
