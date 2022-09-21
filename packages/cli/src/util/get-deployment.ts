import { stringify } from 'querystring';
import type { Deployment } from '@vercel/client';
import type Client from './client';

export async function getDeployment(
  client: Client,
  hostOrId: string,
): Promise<Deployment> {
  let url = `/v13/deployments`;

  if (hostOrId.includes('.')) {
    let host = hostOrId.replace(/^https:\/\//i, '');

    if (host.endsWith('/')) {
      host = host.slice(0, -1);
    }

    url += `/get?${stringify({
      url: host,
    })}`;
  } else {
    url += `/${encodeURIComponent(hostOrId)}`;
  }

  const deployment = await client.fetch<Deployment>(url);
  return deployment;
}
