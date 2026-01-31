import type Client from '../client';
import type { AddRouteInput, AddRouteResponse, RoutePosition } from './types';

interface AddRouteOptions {
  teamId?: string;
  position?: RoutePosition;
}

export default async function addRoute(
  client: Client,
  projectId: string,
  routeInput: AddRouteInput,
  options: AddRouteOptions = {}
): Promise<AddRouteResponse> {
  const { teamId, position } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes${queryString ? `?${queryString}` : ''}`;

  const body: { route: AddRouteInput; position?: RoutePosition } = {
    route: routeInput,
  };

  if (position) {
    body.position = position;
  }

  return await client.fetch<AddRouteResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
