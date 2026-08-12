import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { TestDrainRequestBody, TestDrainResponse } from './types';

export default async function testDrain(
  client: Client,
  body: TestDrainRequestBody
): Promise<TestDrainResponse> {
  return client.fetch<TestDrainResponse>('/v1/drains/test', {
    method: 'POST',
    body: body as unknown as JSONObject,
  });
}
