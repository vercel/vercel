---
'@vercel/frameworks': minor
---

Source the framework list from the frameworks manifest.

The hand-written framework array is replaced by `frameworks.json`, fetched
from the frameworks API at build time (a build artifact, not checked into
git) and interpreted into the same `Framework` shape. All existing exports
are unchanged in shape and content (`frameworks` is now typed
`readonly Framework[]` instead of a literal tuple).
