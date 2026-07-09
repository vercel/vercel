# 08-react-router-single-fetch-data

End-to-end fixture covering React Router v7 single-fetch `.data` request
routing on Vercel's Build Output.

This fixture is adapted from the public reproduction at
[`Strernd/react-router-fetcher-resource-route-bug`](https://github.com/Strernd/react-router-fetcher-resource-route-bug),
extended with the configuration needed to actually exercise the affected
code paths in `@vercel/remix-builder`.

## What it covers

- **Per-route function config splitting.** `app/routes/api.getClusters.ts`
  exports `config = { memory: 512 }` and `app/routes/api.clusters.$id.ts`
  exports `config = { memory: 1024 }`, so each route lands in its own
  server bundle. Without this, every route ends up in one bundle and the
  "wrong function handles `.data` requests" symptom can't surface.
- **Static `.data` URL.** Probe `GET /api/getClusters.data` asserts the
  request reaches the resource-route bundle and not the splat catch-all.
- **Dynamic `.data` URL.** Probe `GET /api/clusters/42.data` exercises
  the dynamic `.data` route rule pushed by `build-vite.ts`.
- **Root single-fetch URL.** Probe `GET /_root.data?_routes=root`
  asserts the root route's loader runs (the root index single-fetch URL
  is `/_root.data`, not `/index.data`).
- **Splat-only `_routes`.** Probes also include the `_routes` form that
  the React Router single-fetch client emits when it can't resolve a
  concrete route on the client side, e.g.
  `?_routes=routes%2Fapi.getClusters`.

## Layout

- `app/root.tsx` exports a tiny `loader` returning `marker: "root-loader"`
  so probes against `/_root.data` can verify the response.
- `app/routes/home.tsx` is the index route (welcome page + a fetcher).
- `app/routes/api.getClusters.ts` is a static resource route (loader-only,
  no default export) with `memory` config.
- `app/routes/api.clusters.$id.ts` is a dynamic resource route with
  `memory` config.
- `app/routes/catch-all.tsx` is the splat route. Its loader returns
  `servedBy: "splat: *"`, so any probe that mistakenly lands on the
  catch-all bundle fails its `mustContain` assertion.
