import Client from '../client';
import { Cert, PaginationOptions } from '../../types';

type Response = {
  certs: Cert[];
  pagination: PaginationOptions;
};

type getCertsArgs = {
  client: Client;
  limit?: number;
  nextTimestamp?: number;
};

export default async function getCerts(args: getCertsArgs) {
  let certsUrl = `/v4/now/certs?limit=${args.limit}`;

  if (args.nextTimestamp) {
    certsUrl += `&until=${args.nextTimestamp}`;
  }

  return await args.client.fetch<Response>(certsUrl);
}
