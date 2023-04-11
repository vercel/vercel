import Client from '../client';
import { Cert, PaginationOptions } from '@vercel-internals/types';

type Response = {
  certs: Cert[];
  pagination: PaginationOptions;
};

export default async function getCerts(
  client: Client,
  next?: number,
  limit = 20
) {
  let certsUrl = `/v4/now/certs?limit=${limit}`;

  if (next) {
    certsUrl += `&until=${next}`;
  }

  return await client.fetch<Response>(certsUrl);
}
