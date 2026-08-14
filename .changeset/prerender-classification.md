---
'@vercel/build-utils': minor
'@vercel/next': minor
'vercel': patch
---

Replace the inferred PPR fields on `Prerender` with the Next.js prerender taxonomy.

`hasPostponed`, `hasFallback`, `isDynamicRoute` and `htmlSize` were derived by
`@vercel/next` from build artifacts (the `.meta` postponed state, which manifest
section a route came from, and a `statSync` of the `.html` shell). Next.js
`>= 16.3.0-canary.96` publishes its own classification in the prerender
manifest, so those four fields are removed in favour of a single optional
`prerenderClassification` on `Prerender` / `PrerenderOptions`:

- `routeType` — `'route' | 'page' | 'shell' | 'fallback'`
- `response` — `'empty' | 'initial' | 'complete'`
- `compute` — `'blocking' | 'resuming' | 'static'`
- `htmlSize` — byte size of the prerendered HTML shell, when the entry has one

The values are carried through unvalidated so a taxonomy value added by a future
Next.js release cannot hard-fail a deploy. `@vercel/next` sets the field only
when Next.js supplied the complete group — absence is legitimate for
`notFoundRoutes` and Pages Router `fallback: false` templates — and only on the
primary output of each prerender group, so a route is classified exactly once.
