import type { DNSRecord } from '@vercel-internals/types';
import { DomainNotFound } from '../errors-ts';
import type Client from '../client';
import getDomainDNSRecords from './get-domain-dns-records';

export type DetailedDNSRecord = DNSRecord & {
  ttl?: number;
  comment?: string;
};

/**
 * Finds a single DNS record of a domain by its ID using the public
 * list endpoint (GET /v{n}/domains/{domain}/records), paging through
 * results until the record is found or the list is exhausted.
 *
 * Returns `DomainNotFound` when the domain does not exist, and `null`
 * when the domain exists but has no record with the given ID.
 */
export default async function findDNSRecordById(
  client: Client,
  domain: string,
  recordId: string
): Promise<DetailedDNSRecord | DomainNotFound | null> {
  let nextTimestamp: number | undefined;
  do {
    const data = await getDomainDNSRecords(
      client,
      domain,
      4,
      nextTimestamp,
      100
    );
    if (data instanceof DomainNotFound) {
      return data;
    }
    const match = data.records.find(record => record.id === recordId);
    if (match) {
      return match as DetailedDNSRecord;
    }
    nextTimestamp = data.pagination?.next ?? undefined;
  } while (nextTimestamp);
  return null;
}
