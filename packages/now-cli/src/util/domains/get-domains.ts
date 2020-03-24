import chalk from 'chalk';
import { Domain, PaginationOptions } from '../../types';
import Client from '../client';
import wait from '../output/wait';

type Response = {
  domains: Domain[];
  pagination: PaginationOptions;
};

export default async function getDomains(
  client: Client,
  contextName: string,
  next?: number
) {
  let domainUrl = `/v5/domains?limit=20`;
  if (next) {
    domainUrl += `&until=${next}`;
  }
  const cancelWait = wait(`Fetching domains under ${chalk.bold(contextName)}`);
  const domains = await client.fetch<Response>(domainUrl);
  cancelWait();
  return domains;
}
