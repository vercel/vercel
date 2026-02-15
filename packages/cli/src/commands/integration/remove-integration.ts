import type { Team } from '@vercel-internals/types';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { getFirstConfiguration } from '../../util/integration/fetch-marketplace-integrations';
import { removeIntegration } from '../../util/integration/remove-integration';
import { getResources } from '../../util/integration-resource/get-resources';
import { handleDeleteResource } from '../../util/integration-resource/handle-delete-resource';
import {
  CancelledError,
  FailedError,
} from '../../util/integration-resource/types';
import { handleDisconnectAllProjects } from '../integration-resource/disconnect';
import { removeSubcommand } from './command';
import { IntegrationRemoveTelemetryClient } from '../../util/telemetry/commands/integration/remove';

export async function remove(client: Client) {
  const telemetry = new IntegrationRemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(3), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }

  const resourceName = parsedArguments.flags['--resource'];
  const isResource = typeof resourceName === 'string';
  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const disconnectAll = !!parsedArguments.flags['--disconnect-all'];

  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliOptionResource(resourceName);
  telemetry.trackCliFlagDisconnectAll(disconnectAll);

  if (disconnectAll && !isResource) {
    output.error(
      'The `--disconnect-all` flag can only be used with `--resource`.'
    );
    return 1;
  }

  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip confirmation in non-interactive mode.'
    );
    return 1;
  }

  if (isResource) {
    return removeResource(client, team, resourceName, telemetry, {
      skipConfirmation,
      disconnectAll,
    });
  }

  const integrationName = parsedArguments.args[1];
  if (!integrationName) {
    output.error('You must specify an integration. See `--help` for details.');
    return 1;
  }

  const hasTooManyArguments = parsedArguments.args.length > 2;
  if (hasTooManyArguments) {
    output.error('Cannot specify more than one integration at a time.');
    return 1;
  }

  return removeInstallation(
    client,
    team,
    integrationName,
    skipConfirmation,
    telemetry
  );
}

async function removeResource(
  client: Client,
  team: Team,
  resourceName: string,
  telemetry: IntegrationRemoveTelemetryClient,
  options: {
    skipConfirmation: boolean;
    disconnectAll: boolean;
  }
): Promise<number> {
  output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client, team.id);
  const targetedResource = resources.find(
    resource => resource.name === resourceName
  );
  output.stopSpinner();

  if (!targetedResource) {
    output.error(`No resource ${chalk.bold(resourceName)} found.`);
    telemetry.trackCliArgumentName(resourceName, false);
    return 1;
  }
  telemetry.trackCliArgumentName(resourceName, true);

  if (options.disconnectAll) {
    try {
      await handleDisconnectAllProjects(
        client,
        targetedResource,
        options.skipConfirmation
      );
    } catch (error) {
      if (error instanceof CancelledError) {
        output.log(error.message);
        return 0;
      }
      if (error instanceof FailedError) {
        output.error(error.message);
        return 1;
      }
      throw error;
    }
  }

  return await handleDeleteResource(client, team, targetedResource, {
    skipConfirmation: options.skipConfirmation,
    skipProjectCheck: options.disconnectAll,
  });
}

async function removeInstallation(
  client: Client,
  team: Team,
  integrationName: string,
  skipConfirmation: boolean,
  telemetry: IntegrationRemoveTelemetryClient
): Promise<number> {
  output.spinner('Retrieving integration…', 500);
  const integrationConfiguration = await getFirstConfiguration(
    client,
    integrationName,
    team.id
  );
  output.stopSpinner();

  if (!integrationConfiguration) {
    output.error(
      `No integration ${chalk.bold(integrationName)} found. To remove a resource, use the \`--resource\` flag.`
    );
    telemetry.trackCliArgumentName(integrationName, false);
    return 1;
  }
  telemetry.trackCliArgumentName(integrationName, true);

  const userDidNotConfirm =
    !skipConfirmation &&
    !(await confirmIntegrationRemoval(
      client,
      integrationConfiguration.slug,
      team
    ));

  if (userDidNotConfirm) {
    output.log('Canceled');
    return 0;
  }

  try {
    output.spinner('Uninstalling integration…', 1000);
    await removeIntegration(client, integrationConfiguration, team);
  } catch (error) {
    output.error(
      chalk.red(
        `Failed to remove ${chalk.bold(integrationName)}: ${(error as Error).message}`
      )
    );
    return 1;
  }

  output.success(`${chalk.bold(integrationName)} successfully removed.`);
  return 0;
}

async function confirmIntegrationRemoval(
  client: Client,
  integration: string,
  team: Team
): Promise<boolean> {
  output.log(
    `The ${chalk.bold(integration)} integration will be removed permanently from team ${chalk.bold(team.name)}.`
  );
  return client.input.confirm(`${chalk.red('Are you sure?')}`, false);
}
