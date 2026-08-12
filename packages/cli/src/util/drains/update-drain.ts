import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { Drain, UpdateDrainRequestBody } from './types';

export default async function updateDrain(
  client: Client,
  id: string,
  body: UpdateDrainRequestBody
): Promise<Drain> {
  return client.fetch<Drain>(`/v1/drains/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: body as unknown as JSONObject,
  });
}
