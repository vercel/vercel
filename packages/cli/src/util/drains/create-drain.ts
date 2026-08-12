import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { CreateDrainRequestBody, Drain } from './types';

export default async function createDrain(
  client: Client,
  body: CreateDrainRequestBody
): Promise<Drain> {
  return client.fetch<Drain>('/v1/drains', {
    method: 'POST',
    body: body as unknown as JSONObject,
  });
}
