import { Domain, PaginationOptions } from '../../types';
import Client from '../client';

type Response = {
  domains: Domain[];
  pagination: PaginationOptions;
};

type getDomainsArgs = {
  client: Client;
  next?: number;
  limit?: number;
};

export default async function getDomains(args: getDomainsArgs) {
  let domainUrl = `/v5/domains?limit=${args.limit}`;
  if (args.next) {
    domainUrl += `&until=${args.next}`;
  }
  return await args.client.fetch<Response>(domainUrl);
}
