import type Client from '../client';

export default async function getDomainStatus(
  client: Client,
  domain: string,
  opts: { bailOn429?: boolean } = {}
) {
  return client.fetch<{ available: boolean }>(
    `/v1/registrar/domains/${encodeURIComponent(domain)}/availability`,
    { bailOn429: opts.bailOn429 }
  );
}
