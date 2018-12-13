import { Cert } from '../../types';
import { Output } from '../output';
import Client from '../client';
import getCerts from './get-certs';

export default async function getCertsForDomain(output: Output, client: Client, domain: string) {
  const certs = await getCerts(output, client);
  return certs.filter((cert: Cert) => cert.cns[0].endsWith(domain));
}
