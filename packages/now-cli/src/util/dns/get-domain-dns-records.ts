import { DNSRecord } from '../../types';
import { DomainNotFound } from '../errors-ts';
import { Output } from '../output';
import Client from '../client';

type Response = {
  records: DNSRecord[];
};

export default async function getDomainDNSRecords(
  output: Output,
  client: Client,
  domain: string
) {
  output.debug(`Fetching for DNS records of domain ${domain}`);
  try {
    const { records } = await client.fetch<Response>(
      `/v3/domains/${encodeURIComponent(domain)}/records`
    );
    return records;
  } catch (error) {
    if (error.code === 'not_found') {
      return new DomainNotFound(domain);
    }
    throw error;
  }
}
