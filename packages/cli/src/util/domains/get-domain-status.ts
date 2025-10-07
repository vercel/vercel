import type Client from '../client';

export default async function getDomainStatus(client: Client, domain: string) {
  return client.fetch<{ available: boolean }>(
    `/v1/registrar/domains/${encodeURIComponent(domain)}/availability`
  );
}
