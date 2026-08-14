import type Client from '../client';
import type { Resource } from './types';

/**
 * Fetches a single store by ID via `GET /v1/storage/stores/:id`.
 *
 * Unlike the list endpoint (`GET /v1/storage/stores`), the per-store endpoint
 * does a live fetch from the partner integration server and returns the fresh
 * `ownership` value — necessary for polling sandbox claim completion when the
 * partner's webhook to Vercel hasn't fired (e.g. Shopify sandbox claims).
 */
export async function getResource(
  client: Client,
  resourceId: string
): Promise<Resource> {
  const { store } = await client.fetch<{ store: Resource }>(
    `/v1/storage/stores/${encodeURIComponent(resourceId)}`,
    { json: true }
  );
  return store;
}
