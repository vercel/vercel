import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import {
  CancelledError,
  FailedError,
  type Resource,
  type ResourceConnection,
} from './types';
import { getResources } from '../../util/integration/get-resources';
import { disconnectSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import handleError from '../../util/handle-error';
import confirm from '../../util/input/confirm';
import {
  disconnectResourceFromAllProjects,
  disconnectResourceFromProject,
} from '../../util/integration/disconnect-resource-from-project';
import { getLinkedProject } from '../../util/projects/link';

export async function disconnect(client: Client) {
  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(
    disconnectSubcommand.options
  );

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

  const hasTooManyArguments = parsedArguments.args.length > 3;
  if (hasTooManyArguments) {
    client.output.error(
      'Cannot specify more than one project at a time. Use `--all` to disconnect the specified resource from all projects.'
    );
    return 1;
  }

  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const shouldDisconnectAll = parsedArguments.flags['--all'];
  const isProjectSpecified = parsedArguments.args.length === 3;

  if (isProjectSpecified && shouldDisconnectAll) {
    client.output.error(
      'Cannot specify a project while using the `--all` flag.'
    );
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

  if (parsedArguments.flags['--all']) {
    try {
      await handleDisconnectAllProjects(
        client,
        targetedResource,
        !!parsedArguments.flags['--yes']
      );
      return 0;
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

  let specifiedProject: string | undefined;

  if (isProjectSpecified) {
    specifiedProject = parsedArguments.args[2];
  }

  if (!specifiedProject) {
    specifiedProject = await getLinkedProject(client).then(result => {
      if (result.status === 'linked') {
        return result.project.name;
      }
      return;
    });
    if (!specifiedProject) {
      client.output.error(
        'No project linked. Either use `vc link` to link a project, or specify the project name.'
      );
      return 1;
    }
  }

  return await handleDisconnectProject(
    client,
    targetedResource,
    specifiedProject,
    skipConfirmation
  );
}

async function handleDisconnectProject(
  client: Client,
  resource: Resource,
  projectName: string,
  skipConfirmation: boolean
): Promise<number> {
  const project = resource.projectsMetadata?.find(
    project => projectName === project.name
  );
  if (!project) {
    client.output.log(
      `Could not find project ${chalk.bold(projectName)} connected to resource ${chalk.bold(resource.name)}.`
    );
    return 0;
  }

  if (
    !skipConfirmation &&
    !(await confirmDisconnectProject(client, resource, project))
  ) {
    client.output.log('Canceled');
    return 0;
  }

  try {
    client.output.spinner('Disconnecting resource…', 500);
    await disconnectResourceFromProject(client, resource, project);
    client.output.success(
      `Disconnected ${chalk.bold(project.name)} from ${chalk.bold(resource.name)}`
    );
  } catch (error) {
    client.output.error(
      `A problem occurred while disconnecting: ${(error as Error).message}`
    );
    return 1;
  }

  return 0;
}

export async function handleDisconnectAllProjects(
  client: Client,
  resource: Resource,
  skipConfirmation: boolean
): Promise<void> {
  if (resource.projectsMetadata?.length === 0) {
    client.output.log(
      `${chalk.bold(resource.name)} has no projects to disconnect.`
    );
    return;
  }

  if (
    !skipConfirmation &&
    !(await confirmDisconnectAllProjects(client, resource))
  ) {
    throw new CancelledError('Canceled');
  }

  try {
    client.output.spinner('Disconnecting projects from resource…', 500);
    await disconnectResourceFromAllProjects(client, resource);
    client.output.success(
      `Disconnected all projects from ${chalk.bold(resource.name)}`
    );
  } catch (error) {
    throw new FailedError(
      `A problem occurred while disconnecting all projects: ${(error as Error).message}`
    );
  }

  return;
}

async function confirmDisconnectProject(
  client: Client,
  resource: Resource,
  project: ResourceConnection
) {
  client.output.log(
    `The resource ${chalk.bold(resource.name)} will be disconnected from project ${chalk.bold(project.name)}.`
  );
  return confirm(client, `${chalk.red('Are you sure?')}`, false);
}

async function confirmDisconnectAllProjects(
  client: Client,
  resource: Resource
): Promise<boolean> {
  client.output.log('The following projects will be disconnected:');
  if (!resource.projectsMetadata) {
    return false;
  }
  for (const project of resource.projectsMetadata) {
    client.output.print(`  ${project.name}\n`);
  }
  return confirm(client, chalk.red('Are you sure?'), false);
}
