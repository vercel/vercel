import type Client from '../client';
import type { RoutingRule, RouteVersion } from './types';

/**
 * Input for editing a route. Requires the full route object (not partial).
 * The API replaces the route entirely with what's provided.
 */
interface EditRouteInput {
  route?: {
    name: string;
    description?: string;
    enabled?: boolean;
    srcSyntax?: string;
    route: {
      src: string;
      dest?: string;
      status?: number;
      headers?: Record<string, string>;
      transforms?: unknown[];
      has?: unknown[];
      missing?: unknown[];
      continue?: boolean;
      caseSensitive?: boolean;
      check?: boolean;
    };
  };
  /** If true, restores the route from production to staging */
  restore?: boolean;
}

interface EditRouteResponse {
  route: RoutingRule;
  version: RouteVersion;
}

interface EditRouteOptions {
  teamId?: string;
}

export default async function editRoute(
  client: Client,
  projectId: string,
  routeId: string,
  input: EditRouteInput,
  options: EditRouteOptions = {}
): Promise<EditRouteResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes/${routeId}${queryString ? `?${queryString}` : ''}`;

  return await client.fetch<EditRouteResponse>(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}
