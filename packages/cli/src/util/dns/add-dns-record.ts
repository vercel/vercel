import Client from '../client';
import {
  DomainNotFound,
  DNSPermissionDenied,
  DNSInvalidPort,
  DNSInvalidType,
  DNSConflictingRecord,
  isAPIError,
} from '../errors-ts';
import { DNSRecordData } from '../../types';

type Response = {
  uid: string;
};

export default async function addDNSRecord(
  client: Client,
  domain: string,
  recordData: DNSRecordData
) {
  try {
    const record = await client.fetch<Response>(
      `/v3/domains/${encodeURIComponent(domain)}/records`,
      {
        body: recordData,
        method: 'POST',
      }
    );
    return record;
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 400 && err.code === 'invalid_type') {
        return new DNSInvalidType(recordData.type);
      }

      if (err.status === 400 && err.message.includes('port')) {
        return new DNSInvalidPort();
      }

      if (err.status === 400) {
        return err;
      }

      if (err.status === 403) {
        return new DNSPermissionDenied(domain);
      }

      if (err.status === 404) {
        return new DomainNotFound(domain);
      }

      if (err.status === 409) {
        const { oldId = '' } = err;
        return new DNSConflictingRecord(oldId);
      }
    }

    throw err;
  }
}
