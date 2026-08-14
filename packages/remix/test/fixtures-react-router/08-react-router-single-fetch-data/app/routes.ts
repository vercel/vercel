import { type RouteConfig, index, route } from "@react-router/dev/routes";

// Mirrors the public reproduction at
// https://github.com/Strernd/react-router-fetcher-resource-route-bug
//
// The configuration is intentionally:
//   - an `index` route at `/` (root index → single-fetch URL is `/_root.data`)
//   - a static resource route at `/api/getClusters`
//   - a dynamic resource route at `/api/clusters/:id`
//   - a splat catch-all at `*`
//
// Each resource route exports `loader` (no default component). The home route
// triggers a fetcher.load against the static resource route, which causes the
// React Router single-fetch client to issue `<path>.data` network requests.
export default [
  index("routes/home.tsx"),
  route("api/getClusters", "routes/api.getClusters.ts"),
  route("api/clusters/:id", "routes/api.clusters.$id.ts"),
  route("*", "routes/catch-all.tsx"),
] satisfies RouteConfig;
