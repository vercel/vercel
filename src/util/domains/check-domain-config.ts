import * as ERRORS from '../errors-ts';
import Client from '../client';

type Response = {
  nameservers: string[];
  serviceType: 'zeit.world' | 'external' | 'na';
  expectedTXTRecord: string;
  txtRecords: string[];
  cnames: string[] | null;
  expectedCNAMEValues: string[] | null;
  aValues: string[] | null;
  misconfigured: boolean;
  misconfiguredReasons: string[];
};

export default async function checkDomainConfig(client: Client, name: string) {
  try {
    return await client.fetch<Response>(`/v3/domains/${name}/config`);
  } catch (error) {
    if (error.code === 'invalid_name') {
      return new ERRORS.InvalidDomain(name);
    }
    throw error;
  }
}
