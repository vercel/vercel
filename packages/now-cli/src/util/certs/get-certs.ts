import Client from '../client';
import { Cert, PaginationOptions } from '../../types';

type Response = {
  certs: Cert[];
  pagination: PaginationOptions;
};

export default async function getCerts(client: Client, next?: number) {
  let certsUrl = `/v4/now/certs?limit=20`;

  if (next) {
    certsUrl += `&until=${next}`;
  }

  return await client.fetch<Response>(certsUrl);
}
