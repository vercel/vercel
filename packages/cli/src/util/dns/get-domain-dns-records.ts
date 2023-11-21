import { DNSRecord, PaginationOptions } from '@vercel-internals/types';
import { DomainNotFound, isAPIError } from '../errors-ts.js';
import { Output } from '../output/index.js';
import Client from '../client.js';

type Response = {
  records: DNSRecord[];
  pagination?: PaginationOptions;
};

export default async function getDomainDNSRecords(
  output: Output,
  client: Client,
  domain: string,
  apiVersion = 3,
  nextTimestamp?: number,
  limit = 20
) {
  output.debug(`Fetching for DNS records of domain ${domain}`);
  try {
    let url = `/v${apiVersion}/domains/${encodeURIComponent(
      domain
    )}/records?limit=${limit}`;

    if (nextTimestamp) {
      url += `&until=${nextTimestamp}`;
    }

    const data = await client.fetch<Response>(url);
    return data;
  } catch (err: unknown) {
    if (isAPIError(err) && err.code === 'not_found') {
      return new DomainNotFound(domain);
    }
    throw err;
  }
}
