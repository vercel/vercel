import { Domain, PaginationOptions } from '../../types';
import Client from '../client';

type Response = {
  domains: Domain[];
  pagination: PaginationOptions;
};

export default async function getDomains(client: Client, next?: number) {
  let domainUrl = `/v5/domains?limit=20`;
  if (next) {
    domainUrl += `&until=${next}`;
  }
  return await client.fetch<Response>(domainUrl);
}
