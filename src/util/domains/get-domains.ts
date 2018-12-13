import chalk from 'chalk';
import { Domain } from '../../types';
import Client from '../client';
import wait from '../output/wait';

type Response = {
  domains: Domain[];
};

export default async function getDomains(client: Client, contextName: string) {
  const cancelWait = wait(`Fetching domains under ${chalk.bold(contextName)}`);
  const { domains } = await client.fetch<Response>('/v4/domains');
  cancelWait();
  return domains.sort(
    (domainA, domainB) => domainB.createdAt - domainA.createdAt
  );
}
