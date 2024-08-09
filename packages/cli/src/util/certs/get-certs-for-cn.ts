import { stringify } from 'querystring';
import type { Cert } from '@vercel-internals/types';
import Client from '../client';

/**
 * Returns certs that contain @param cn.
 */
export async function getCertsForCn(
  client: Client,
  cn: string,
  { limit }: { limit?: number } = {}
) {
  const { certs } = await client.fetch<{
    certs: Cert[];
  }>(`/v4/now/certs?${stringify({ cn, ...(limit ? { limit } : {}) })}`);
  return certs;
}
