import { DomainNotFound, isAPIError } from '../errors-ts';
import type { DNSRecord, PaginationOptions } from '../../types';
import type { Output } from '../output';
import type Client from '../client';

interface Response {
  records: DNSRecord[];
  pagination?: PaginationOptions;
}

export default async function getDomainDNSRecords(
  output: Output,
  client: Client,
  domain: string,
  nextTimestamp?: number,
  apiVersion = 3,
) {
  output.debug(`Fetching for DNS records of domain ${domain}`);
  try {
    let url = `/v${apiVersion}/domains/${encodeURIComponent(
      domain,
    )}/records?limit=20`;

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
