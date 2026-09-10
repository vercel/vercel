import type { DNSRecord } from '@vercel-internals/types';
import type Client from '../client';

/** The endpoint also returns TTL and comment, absent from `DNSRecord`. */
export type DetailedDNSRecord = DNSRecord & {
  ttl?: number;
  comment?: string;
};

export default async function getDNSRecordById(
  client: Client,
  id: string
): Promise<DetailedDNSRecord> {
  return client.fetch<DetailedDNSRecord>(`/v5/domains/records/${id}`);
}
