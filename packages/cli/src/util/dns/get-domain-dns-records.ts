import { DNSRecord, PaginationOptions } from '../../types';
import { DomainNotFound, isAPIError } from '../errors-ts';
import { Output } from '../output';
import Client from '../client';

type Response = {
  records: DNSRecord[];
  pagination?: PaginationOptions;
};

type getDomainDNSRecordsArgs = {
  output: Output;
  client: Client;
  domain: string;
  nextTimestamp?: number;
  limit?: number;
};

export default async function getDomainDNSRecords(
  args: getDomainDNSRecordsArgs
) {
  args.output.debug(`Fetching for DNS records of domain ${args.domain}`);
  try {
    let url = `/v4/domains/${encodeURIComponent(args.domain)}/records?limit=${
      args.limit
    }`;

    if (args.nextTimestamp) {
      url += `&until=${args.nextTimestamp}`;
    }

    const data = await args.client.fetch<Response>(url);
    return data;
  } catch (err: unknown) {
    if (isAPIError(err) && err.code === 'not_found') {
      return new DomainNotFound(args.domain);
    }
    throw err;
  }
}
