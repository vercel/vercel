import qs from 'querystring';
import type Client from '../client';

export default async function getDomainStatus(client: Client, domain: string) {
  return client.fetch<{ available: boolean }>(
    `/v3/domains/status?${qs.stringify({ name: domain })}`
  );
}
