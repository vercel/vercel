---
'@vercel/build-utils': minor
'@vercel/next': minor
'vercel': patch
---

Replace `prerenderClassification` on `Prerender` with `initialMetadata`.

The platform consumes only the request-time compute mode and the HTML shell
size, so the flattened four-field taxonomy (`routeType`, `response`,
`compute`, `htmlSize`) is reduced to a single grouped field:

```ts
initialMetadata?: {
  compute: 'blocking' | 'resuming' | 'static';
  htmlSize?: number;
}
```

The group is named `initialMetadata` because the values describe the
deployment as it was built: revalidation can regenerate a route's output over
the deployment's lifetime, so readers must treat them as initial values, not
live state. `@vercel/next` reads `compute` and `htmlSize` off the v4
prerender-manifest taxonomy and deliberately ignores `routeType` and
`response`; the values are still carried unvalidated so a compute mode added
by a future framework release cannot hard-fail a deploy, and they are still
set only on the primary output of each prerender group. `htmlSize: 0` is a
real size (a shell that postponed everything); `htmlSize` is absent when
there is no HTML shell to measure (route handlers, Pages Router). Absence of
the whole group remains legitimate (`notFoundRoutes`, Pages Router
`fallback: false`, older frameworks).
