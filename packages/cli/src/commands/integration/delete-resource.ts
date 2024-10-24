import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { CancelledError, FailedError, type Resource } from './types';
import { getResources } from '../../util/integration/get-resources';
import { deleteSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import handleError from '../../util/handle-error';
import type { Team } from '@vercel-internals/types';
import confirm from '../../util/input/confirm';
import { deleteResource as _deleteResource } from '../../util/integration/delete-resource';
import { handleDisconnectAllProjects } from './disconnect';

export async function deleteResource(client: Client) {
  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(deleteSubcommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(3), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { team } = await getScope(client);
  if (!team) {
    client.output.error('Team not found.');
    return 1;
  }

  const isMissingResourceOrIntegration = parsedArguments.args.length < 2;
  if (isMissingResourceOrIntegration) {
    client.output.error(
      'You must specify a resource. See `--help` for details.'
    );
    return 1;
  }

  const hasTooManyArguments = parsedArguments.args.length > 2;
  if (hasTooManyArguments) {
    client.output.error('Cannot specify more than one resource at a time.');
    return 1;
  }

  const resourceName = parsedArguments.args[1];

  client.output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client, team.id);
  const targetedResource = resources.find(
    resource => resource.name === resourceName
  );
  client.output.stopSpinner();

  if (!targetedResource) {
    client.output.error(`No resource ${chalk.bold(resourceName)} found.`);
    return 0;
  }

  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const disconnectAll = !!parsedArguments.flags['--disconnect-all'];

  if (disconnectAll) {
    try {
      await handleDisconnectAllProjects(
        client,
        targetedResource,
        skipConfirmation
      );
    } catch (error) {
      if (error instanceof CancelledError) {
        client.output.log(error.message);
        return 0;
      }
      if (error instanceof FailedError) {
        client.output.error(error.message);
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
    client.output.error(
      `Cannot delete resource ${chalk.bold(resource.name)} while it has connected projects. Please disconnect any projects using this resource first or use the \`--disconnect-all\` flag.`
    );
    return 1;
  }

  if (
    !options?.skipConfirmation &&
    !(await confirmDeleteResource(client, resource))
  ) {
    client.output.log('Canceled');
    return 0;
  }

  try {
    client.output.spinner('Deleting resource…', 500);
    await _deleteResource(client, resource, team);
    client.output.success(`${chalk.bold(resource.name)} successfully deleted.`);
  } catch (error) {
    client.output.error(
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
  client.output.log(
    `${chalk.bold(resource.name)} will be deleted permanently.`
  );
  return confirm(client, `${chalk.red('Are you sure?')}`, false);
}
