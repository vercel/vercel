import type { Route } from "./+types/api.getClusters";

// Per-route function config — non-default `memory` forces this route into its
// own server bundle (see `vercelPreset()`'s `serverBundles` callback).
//
// Without per-route config, every route in the fixture lands in a single
// bundle and the build output never has more than one function entry, so the
// "wrong function handles `.data` requests" symptom can't be observed.
export const config = {
  memory: 512,
};

export async function loader({ request }: Route.LoaderArgs) {
  const servedBy = "resource-route: /api/getClusters";
  return {
    servedBy,
    url: request.url,
    clusters: [
      { id: 1, lat: 48.8566, lon: 2.3522, count: 12 },
      { id: 2, lat: 40.7128, lon: -74.006, count: 7 },
    ],
  };
}
