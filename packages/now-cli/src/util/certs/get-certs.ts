import Client from '../client';
import { Output } from '../output';
import { Cert } from '../../types';

type Response = {
  certs: Cert[];
};

export default async function getCerts(output: Output, client: Client) {
  const { certs } = await client.fetch<Response>(`/v3/now/certs`);
  return certs;
}
