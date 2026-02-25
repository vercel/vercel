import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import type { Configuration } from '../../util/integration/types';
import { getFirstConfiguration } from '../../util/integration/fetch-marketplace-integrations';
import { buildSSOLink } from '../../util/integration/build-sso-link';
import { IntegrationOpenTelemetryClient } from '../../util/telemetry/commands/integration/open';
import { getResources } from '../../util/integration-resource/get-resources';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { openSubcommand } from './command';
import output from '../../output-manager';

export async function openIntegration(client: Client, subArgs: string[]) {
  const telemetry = new IntegrationOpenTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(openSubcommand.options);
  let parsedArguments;
  try {
    parsedArguments = parseArguments(subArgs, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args } = parsedArguments;
  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);

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
  client.config.currentTeam = team.id;

  let configuration: Configuration | undefined;
  let knownIntegrationSlug = false;

  try {
    configuration = await getFirstConfiguration(client, integrationSlug);
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
    let resources;
    try {
      resources = await getResources(client);
    } catch (error) {
      output.error(`Failed to fetch resources: ${(error as Error).message}`);
      return 1;
    }

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

    outputLink(client, link, asJson, resourceName, true);
    return 0;
  }

  // No resource specified — open the integration dashboard
  const link = buildSSOLink(team, configurationId);

  outputLink(client, link, asJson, integrationSlug, false);
  return 0;
}

function outputLink(
  client: Client,
  link: string,
  json: boolean,
  name: string,
  isResource: boolean
) {
  if (json) {
    client.stdout.write(`${JSON.stringify({ url: link }, null, 2)}\n`);
  } else if (client.stdout.isTTY) {
    const label = isResource
      ? `Opening the ${chalk.bold(name)} resource dashboard...`
      : `Opening the ${chalk.bold(name)} dashboard...`;
    output.print(label);
    open(link);
  } else {
    client.stdout.write(`${link}\n`);
  }
}
