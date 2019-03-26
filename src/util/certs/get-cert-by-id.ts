import { Cert } from '../../types';
import { Output } from '../output/create-output';
import Client from '../client';

type CertDetails = Cert & {
  key: string;
  ca: string;
  crt: string;
};

export default async function getCertById(
  output: Output,
  client: Client,
  id: string
) {
  const cert = await client.fetch<CertDetails>(`/v3/now/certs/${id}?limit=1`);
  // If `id` isn't a valid id the API responds with a set of certificates instead
  if (!cert || !cert.key) return null;
  return cert;
}
