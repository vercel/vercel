import type { DNSRecord } from '@vercel-internals/types';
import type Client from '../client';

export interface UpdateDNSRecordData {
  name?: string;
  type?: string;
  value?: string;
  ttl?: number;
  mxPriority?: number;
  srv?: {
    priority: number;
    weight: number;
    port: number;
    target: string;
  };
  comment?: string;
}

export type UpdatedDNSRecord = Pick<
  DNSRecord,
  'id' | 'name' | 'value' | 'creator' | 'domain'
> & {
  type: 'record' | 'record-sys';
  recordType: string;
  ttl?: number;
  comment?: string;
  createdAt?: number | null;
};

export default async function updateDNSRecord(
  client: Client,
  recordId: string,
  data: UpdateDNSRecordData
): Promise<UpdatedDNSRecord> {
  return client.fetch<UpdatedDNSRecord>(
    `/v1/domains/records/${encodeURIComponent(recordId)}`,
    {
      method: 'PATCH',
      body: data,
    }
  );
}
