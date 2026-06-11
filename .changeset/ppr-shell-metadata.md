---
'@vercel/build-utils': minor
'@vercel/next': minor
---

Add `hasFallback`, `htmlSize`, and `isDynamicRoute` to `Prerender`

These optional fields surface per-route PPR shell metadata in the Build Output so consumers can classify prerenders (e.g. full shell vs. empty shell vs. concrete prerender):

- `hasFallback` — whether a dynamic route template had a static fallback (`undefined` for concrete prerenders)
- `htmlSize` — byte size of the prerendered `.html` shell (`0` for an empty shell, `undefined` when there's no `.html`)
- `isDynamicRoute` — whether the entry came from a dynamic route template rather than a concrete prerender
