---
'@vercel/next': patch
---

Avoid route token collisions for dynamic params that overlap with internal segment-cache capture names (for example `[...segments]`) by:

- remapping the internal segment suffix capture token before generating prefetch segment rewrite destinations, and
- preserving `routeKeys` from `routes-manifest.json` so Next.js receives the original dynamic param names.
