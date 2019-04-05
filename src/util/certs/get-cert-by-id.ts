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
  return cert || null;
}
