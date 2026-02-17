---
'@vercel/next': patch
---

Avoid route token collisions for dynamic params that overlap with internal segment-cache capture names (for example `[...segments]`) by:

- remapping the internal segment suffix capture token before generating prefetch segment rewrite destinations, and
- normalizing conflicting `routeKeys` from `routes-manifest.json` before generating dynamic route rewrites and prerender `allowQuery` metadata.
