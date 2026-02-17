---
'@vercel/next': patch
---

Avoid segment prefetch route token collisions for dynamic params that include `segment` (for example `[...segments]`) by remapping the internal segment suffix capture token before generating rewrite destinations.
