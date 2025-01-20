import type { Team } from '@vercel-internals/types';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { deleteResource as _deleteResource } from '../../util/integration-resource/delete-resource';
import { getResources } from '../../util/integration-resource/get-resources';
import {
  CancelledError,
  FailedError,
  type Resource,
} from '../../util/integration-resource/types';
import { IntegrationResourceRemoveTelemetryClient } from '../../util/telemetry/commands/integration-resource/remove';
import { removeSubcommand } from './command';
import { handleDisconnectAllProjects } from './disconnect';

export async function remove(client: Client) {
  const telemetry = new IntegrationResourceRemoveTelemetryClient({
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

  const isMissingResourceOrIntegration = parsedArguments.args.length < 2;
  if (isMissingResourceOrIntegration) {
    output.error('You must specify a resource. See `--help` for details.');
    return 1;
  }

  const hasTooManyArguments = parsedArguments.args.length > 2;
  if (hasTooManyArguments) {
    output.error('Cannot specify more than one resource at a time.');
    return 1;
  }

  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const disconnectAll = !!parsedArguments.flags['--disconnect-all'];
  const resourceName = parsedArguments.args[1];

  telemetry.trackCliArgumentResource(resourceName);
  telemetry.trackCliFlagDisconnectAll(disconnectAll);
  telemetry.trackCliFlagYes(skipConfirmation);

  output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client, team.id);
  const targetedResource = resources.find(
    resource => resource.name === resourceName
  );
  output.stopSpinner();

  if (!targetedResource) {
    output.error(`No resource ${chalk.bold(resourceName)} found.`);
    return 0;
  }

  if (disconnectAll) {
    try {
      await handleDisconnectAllProjects(
        client,
        targetedResource,
        skipConfirmation
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
    skipConfirmation,
    skipProjectCheck: disconnectAll,
  });
}

async function handleDeleteResource(
  client: Client,
  team: Team,
  resource: Resource,
  options?: {
    skipConfirmation: boolean;
    skipProjectCheck: boolean;
  }
): Promise<number> {
  const hasProjects =
    resource.projectsMetadata && resource.projectsMetadata?.length > 0;
  if (!options?.skipProjectCheck && hasProjects) {
    output.error(
      `Cannot delete resource ${chalk.bold(resource.name)} while it has connected projects. Please disconnect any projects using this resource first or use the \`--disconnect-all\` flag.`
    );
    return 1;
  }

  if (
    !options?.skipConfirmation &&
    !(await confirmDeleteResource(client, resource))
  ) {
    output.log('Canceled');
    return 0;
  }

  try {
    output.spinner('Deleting resource…', 500);
    await _deleteResource(client, resource, team);
    output.success(`${chalk.bold(resource.name)} successfully deleted.`);
  } catch (error) {
    output.error(
      `A problem occurred when attempting to delete ${chalk.bold(resource.name)}: ${(error as Error).message}`
    );
    return 1;
  }

  return 0;
}

async function confirmDeleteResource(
  client: Client,
  resource: Resource
): Promise<boolean> {
  output.log(`${chalk.bold(resource.name)} will be deleted permanently.`);
  return client.input.confirm(`${chalk.red('Are you sure?')}`, false);
}
