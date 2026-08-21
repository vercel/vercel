---
'@vercel/build-utils': minor
'@vercel/next': minor
'vercel': patch
---

Replace `prerenderClassification` on `Prerender` with `initialMetadata`.

The platform consumes only the request-time compute mode, so the four-field
taxonomy (`routeType`, `response`, `compute`, `htmlSize`) is reduced to a
single grouped field:

```ts
initialMetadata?: {
  compute: 'blocking' | 'resuming' | 'static';
}
```

The group is named `initialMetadata` because the values describe the
deployment as it was built: revalidation can regenerate a route's output over
the deployment's lifetime, so readers must treat them as initial values, not
live state. `@vercel/next` reads `compute` off the v4 prerender-manifest
taxonomy and deliberately ignores the other fields; the value is still carried
unvalidated so a compute mode added by a future framework release cannot
hard-fail a deploy, and it is still set only on the primary output of each
prerender group. Absence remains legitimate (`notFoundRoutes`, Pages Router
`fallback: false`, older frameworks).
