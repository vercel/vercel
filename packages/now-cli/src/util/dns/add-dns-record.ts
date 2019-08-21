import Client from '../client';
import {
  DomainNotFound,
  DNSPermissionDenied,
  DNSInvalidPort,
  DNSInvalidType,
  DNSConflictingRecord
} from '../errors-ts';
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
    if (error.status === 400 && error.code === 'invalid_type') {
      return new DNSInvalidType(recordData.type);
    }

    if (error.status === 400 && error.message.includes('port')) {
      return new DNSInvalidPort();
    }

    if (error.status === 400) {
      return error;
    }

    if (error.status === 403) {
      return new DNSPermissionDenied(domain);
    }

    if (error.status === 404) {
      return new DomainNotFound(domain);
    }

    if (error.status === 409) {
      const { oldId = '' } = error;
      return new DNSConflictingRecord(oldId);
    }

    throw error;
  }
}
