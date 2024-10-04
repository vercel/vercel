import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import type { Configuration } from './types';
import { fetchMarketplaceIntegrations } from './client';

export async function openIntegration(client: Client, args: string[]) {
  if (args.length > 1) {
    client.output.error('Cannot open more than one integration at a time');
    return 1;
  }

  const integrationSlug = args[0];

  if (!integrationSlug) {
    client.output.error('Error: You must pass an integration slug');
    return 1;
  }

  const { team } = await getScope(client);

  if (!team) {
    client.output.error('Error: no team found.');
    return 1;
  }

  let configuration: Configuration | undefined;

  try {
    configuration = (
      await fetchMarketplaceIntegrations(client, integrationSlug)
    )[0];
  } catch (error) {
    client.output.error(
      `Error: Failed to fetch configurations for ${chalk.bold(`"${integrationSlug}"`)}: ${(error as Error).message}`
    );
  }

  if (!configuration) {
    client.output.error(
      `No configuration found for ${chalk.bold(`"${integrationSlug}"`)}.`
    );
    return 1;
  }

  client.output.print(
    `Opening the ${chalk.bold(integrationSlug)} dashboard...`
  );

  const url = new URL('/api/marketplace/sso', 'https://vercel.com');
  url.searchParams.set('teamId', team.id);
  url.searchParams.set('integrationConfigurationId', configuration.id);
  open(url.href);

  return 0;
}
