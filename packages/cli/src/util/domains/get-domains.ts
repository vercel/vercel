import { Domain, PaginationOptions } from '@vercel-internals/types';
import Client from '../client.js';

type Response = {
  domains: Domain[];
  pagination: PaginationOptions;
};

export default async function getDomains(
  client: Client,
  next?: number,
  limit = 20
) {
  let domainUrl = `/v5/domains?limit=${limit}`;
  if (next) {
    domainUrl += `&until=${next}`;
  }
  return await client.fetch<Response>(domainUrl);
}
