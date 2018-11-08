// @flow
import { Now, Output } from '../types';
import { DomainNotFound, DNSPermissionDenied } from '../errors';

export type RecordParams =
  | {
      mxPriority?: number,
      name: string,
      type: string,
      value: string
    }
  | {
      name: string,
      type: string,
      srv: {
        port: number,
        priority: number,
        target: string,
        weight: number
      }
    };

async function addDNSRecord(
  output: Output,
  now: Now,
  domain: string,
  recordParams: RecordParams
) {
  try {
    const record: {
      uid: string,
      updated: number
    } = await now.fetch(`/v3/domains/${domain}/records`, {
      body: recordParams,
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

export default addDNSRecord;
