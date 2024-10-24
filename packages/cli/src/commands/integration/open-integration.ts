import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import type { Configuration } from './types';
import { fetchMarketplaceIntegrations } from '../../util/integration/fetch-marketplace-integrations';
import { buildSSOLink } from '../../util/integration/build-sso-link';
import output from '../../output-manager';

export async function openIntegration(client: Client, args: string[]) {
  if (args.length > 1) {
    output.error('Cannot open more than one dashboard at a time');
    return 1;
  }

  const integrationSlug = args[0];

  if (!integrationSlug) {
    output.error('You must pass an integration slug');
    return 1;
  }

  const { team } = await getScope(client);

  if (!team) {
    output.error('Team not found');
    return 1;
  }

  let configuration: Configuration | undefined;

  try {
    configuration = await getFirstConfiguration(client, integrationSlug);
  } catch (error) {
    output.error(
      `Failed to fetch configuration for ${chalk.bold(`"${integrationSlug}"`)}: ${(error as Error).message}`
    );
    return 1;
  }

  if (!configuration) {
    output.error(
      `No configuration found for ${chalk.bold(`"${integrationSlug}"`)}.`
    );
    return 1;
  }

  output.print(`Opening the ${chalk.bold(integrationSlug)} dashboard...`);

  open(buildSSOLink(team, configuration.id));

  return 0;
}

async function getFirstConfiguration(client: Client, integrationSlug: string) {
  const configurations = await fetchMarketplaceIntegrations(
    client,
    integrationSlug
  );
  return configurations.length > 0 ? configurations[0] : undefined;
}
