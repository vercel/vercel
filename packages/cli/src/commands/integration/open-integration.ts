import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import type { Configuration } from '../../util/integration/types';
import { getFirstConfiguration } from '../../util/integration/fetch-marketplace-integrations';
import { buildSSOLink } from '../../util/integration/build-sso-link';
import { IntegrationOpenTelemetryClient } from '../../util/telemetry/commands/integration/open';
import { getResources } from '../../util/integration-resource/get-resources';
import output from '../../output-manager';

export async function openIntegration(
  client: Client,
  args: string[],
  printOnly?: boolean
) {
  const telemetry = new IntegrationOpenTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  telemetry.trackCliFlagPrintOnly(printOnly);

  if (args.length > 2) {
    output.error(
      'Too many arguments. Usage: integration open <name> [resource]'
    );
    return 1;
  }

  const integrationSlug = args[0];
  const resourceName = args[1];

  if (!integrationSlug) {
    output.error('You must pass an integration name');
    return 1;
  }

  const { team } = await getScope(client);

  if (!team) {
    output.error('Team not found');
    return 1;
  }

  let configuration: Configuration | undefined;
  let knownIntegrationSlug = false;

  try {
    configuration = await getFirstConfiguration(
      client,
      integrationSlug,
      team.id
    );
    knownIntegrationSlug = !!configuration;
  } catch (error) {
    output.error(
      `Failed to fetch configuration for ${chalk.bold(`"${integrationSlug}"`)}: ${(error as Error).message}`
    );
    return 1;
  } finally {
    telemetry.trackCliArgumentName(integrationSlug, knownIntegrationSlug);
    if (resourceName) {
      telemetry.trackCliArgumentResource(resourceName);
    }
  }

  if (!configuration) {
    output.error(
      `No configuration found for ${chalk.bold(`"${integrationSlug}"`)}.`
    );
    return 1;
  }

  const configurationId = configuration.id;

  // If a resource name is provided, look it up and build SSO link with resource_id
  if (resourceName) {
    const resources = await getResources(client, team.id);
    const resource = resources.find(
      r =>
        r.name === resourceName &&
        r.product?.integrationConfigurationId === configurationId
    );

    if (!resource) {
      output.error(
        `Resource ${chalk.bold(`"${resourceName}"`)} not found for integration ${chalk.bold(`"${integrationSlug}"`)}.`
      );
      return 1;
    }

    const link = buildSSOLink(
      team,
      configurationId,
      resource.externalResourceId
    );

    if (printOnly) {
      output.print(`${link}\n`);
    } else {
      output.print(
        `Opening the ${chalk.bold(resourceName)} resource dashboard...`
      );
      open(link);
    }

    return 0;
  }

  // No resource specified — open the integration dashboard
  const link = buildSSOLink(team, configurationId);

  if (printOnly) {
    output.print(`${link}\n`);
  } else {
    output.print(`Opening the ${chalk.bold(integrationSlug)} dashboard...`);
    open(link);
  }

  return 0;
}
