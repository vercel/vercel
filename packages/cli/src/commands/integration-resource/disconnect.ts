import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import {
  disconnectResourceFromAllProjects,
  disconnectResourceFromProject,
} from '../../util/integration-resource/disconnect-resource-from-project';
import { getResources } from '../../util/integration-resource/get-resources';
import { getLinkedProject } from '../../util/projects/link';
import { IntegrationResourceDisconnectTelemetryClient } from '../../util/telemetry/commands/integration-resource/disconnect';
import {
  CancelledError,
  FailedError,
  type Resource,
  type ResourceConnection,
} from '../../util/integration-resource/types';
import { disconnectSubcommand } from './command';

export async function disconnect(client: Client) {
  const telemetry = new IntegrationResourceDisconnectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(
    disconnectSubcommand.options
  );

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

  const hasTooManyArguments = parsedArguments.args.length > 3;
  if (hasTooManyArguments) {
    output.error(
      'Cannot specify more than one project at a time. Use `--all` to disconnect the specified resource from all projects.'
    );
    return 1;
  }

  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const shouldDisconnectAll = parsedArguments.flags['--all'];
  const isProjectSpecified = parsedArguments.args.length === 3;

  if (isProjectSpecified && shouldDisconnectAll) {
    output.error('Cannot specify a project while using the `--all` flag.');
    return 1;
  }

  const resourceName = parsedArguments.args[1];
  let specifiedProject: string | undefined;

  if (isProjectSpecified) {
    specifiedProject = parsedArguments.args[2];
  }

  telemetry.trackCliArgumentResource(resourceName);
  telemetry.trackCliArgumentProject(specifiedProject);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliFlagAll(shouldDisconnectAll);

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

  if (!specifiedProject) {
    specifiedProject = await getLinkedProject(client).then(result => {
      if (result.status === 'linked') {
        return result.project.name;
      }
      return;
    });
    if (!specifiedProject) {
      output.error(
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
    output.log(
      `Could not find project ${chalk.bold(projectName)} connected to resource ${chalk.bold(resource.name)}.`
    );
    return 0;
  }

  if (
    !skipConfirmation &&
    !(await confirmDisconnectProject(client, resource, project))
  ) {
    output.log('Canceled');
    return 0;
  }

  try {
    output.spinner('Disconnecting resource…', 500);
    await disconnectResourceFromProject(client, resource, project);
    output.success(
      `Disconnected ${chalk.bold(project.name)} from ${chalk.bold(resource.name)}`
    );
  } catch (error) {
    output.error(
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
    output.log(`${chalk.bold(resource.name)} has no projects to disconnect.`);
    return;
  }

  if (
    !skipConfirmation &&
    !(await confirmDisconnectAllProjects(client, resource))
  ) {
    throw new CancelledError('Canceled');
  }

  try {
    output.spinner('Disconnecting projects from resource…', 500);
    await disconnectResourceFromAllProjects(client, resource);
    output.success(
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
  output.log(
    `The resource ${chalk.bold(resource.name)} will be disconnected from project ${chalk.bold(project.name)}.`
  );
  return client.input.confirm(`${chalk.red('Are you sure?')}`, false);
}

async function confirmDisconnectAllProjects(
  client: Client,
  resource: Resource
): Promise<boolean> {
  output.log('The following projects will be disconnected:');
  if (!resource.projectsMetadata) {
    return false;
  }
  for (const project of resource.projectsMetadata) {
    output.print(`  ${project.name}\n`);
  }
  return client.input.confirm(chalk.red('Are you sure?'), false);
}
