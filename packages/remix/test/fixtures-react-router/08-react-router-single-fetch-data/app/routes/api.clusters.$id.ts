import type { Route } from "./+types/api.clusters.$id";

// Dynamic resource route. `<path>.data` requests for dynamic routes go through
// the dynamic route rule pushed by `build-vite.ts`. The per-route `memory`
// override forces this into its own bundle so the rule is exercised against
// a route whose function config differs from the catch-all.
export const config = {
  memory: 1024,
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const servedBy = `resource-route: /api/clusters/${params.id}`;
  return { servedBy, id: params.id, url: request.url };
}
