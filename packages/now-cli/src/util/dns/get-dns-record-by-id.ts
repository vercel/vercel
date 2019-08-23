import getDNSRecords from './get-dns-records';
import { DNSRecord } from '../../types';
import { Output } from '../output';
import Client from '../client';

type Result = {
  domainName: string,
  record: DNSRecord
}

export default async function getDNSRecordById(
  output: Output,
  client: Client,
  contextName: string,
  id: string
): Promise<Result | null> {
  const recordsByDomains = await getDNSRecords(output, client, contextName);
  return recordsByDomains.reduce((result: Result | null, { domainName, records }) => {
    if (result) {
      return result;
    }
    const record = records.find(record => record.id === id);
    return record ? { domainName, record } : null;
  }, null);
}
