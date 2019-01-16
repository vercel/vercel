import Client from '../client';
import { DomainNotFound, DNSPermissionDenied } from '../errors-ts';
import { DNSRecordData } from '../../types';

type Response = {
  uid: string;
}

export default async function addDNSRecord(
  client: Client,
  domain: string,
  recordData: DNSRecordData
) {
  try {
    const record = await client.fetch<Response>(`/v3/domains/${domain}/records`, {
      body: recordData,
      method: 'POST'
    });
    return record;
  } catch (error) {
    if (error.status === 403) {
      return new DNSPermissionDenied(domain);
    }

    if (error.status === 404) {
      return new DomainNotFound(domain);
    }

    throw error;
  }
}
