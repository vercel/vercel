import { stringify } from 'querystring';
import Client from '../client';
import { Output } from '../output';
import { Cert } from '../../types';

type Response = {
  certs: Cert[]
}

export default async function getCerts(output: Output, client: Client, domain?: string) {
  const query = domain ? stringify({ domain }) : '';
  const { certs } = await client.fetch<Response>(`/v3/now/certs?${query}`);
  return certs;
}
