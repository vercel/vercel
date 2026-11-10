import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
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
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import { disconnectSubcommand } from './command';

export async function disconnect(client: Client, argv: string[]) {
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
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const skipConfirmation = !!parsedArguments.flags['--yes'];

  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);

  if (asJson && !skipConfirmation) {
    output.error('--json requires --yes to skip confirmation prompts');
    return 2;
  }

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }
  client.config.currentTeam = team.id;

  const isMissingResource = parsedArguments.args.length < 1;
  if (isMissingResource) {
    output.error('You must specify a resource. See `--help` for details.');
    return 2;
  }

  const hasTooManyArguments = parsedArguments.args.length > 2;
  if (hasTooManyArguments) {
    output.error(
      'Cannot specify more than one project at a time. Use `--all` to disconnect the specified resource from all projects.'
    );
    return 1;
  }

  const shouldDisconnectAll = parsedArguments.flags['--all'];
  const isProjectSpecified = parsedArguments.args.length === 2;

  if (isProjectSpecified && shouldDisconnectAll) {
    output.error('Cannot specify a project while using the `--all` option.');
    return 2;
  }

  const resourceReference = parsedArguments.args[0];
  let specifiedProject: string | undefined;

  if (isProjectSpecified) {
    specifiedProject = parsedArguments.args[1];
  }

  telemetry.trackCliArgumentResource(resourceReference);
  telemetry.trackCliArgumentProject(specifiedProject);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliFlagAll(shouldDisconnectAll);

  output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client);
  const targetedResource =
    resources.find(resource => resource.name === resourceReference) ??
    resources.find(resource => resource.id === resourceReference);
  output.stopSpinner();

  if (!targetedResource) {
    output.error(`No resource ${chalk.bold(resourceReference)} found.`);
    return 1;
  }

  if (parsedArguments.flags['--all']) {
    try {
      await handleDisconnectAllProjects(
        client,
        targetedResource,
        !!parsedArguments.flags['--yes'],
        asJson
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

    if (asJson) {
      const projects =
        targetedResource.projectsMetadata?.map(project => project.name) ?? [];
      client.stdout.write(
        `${JSON.stringify({ resource: targetedResource.name, disconnected: true, projects }, null, 2)}\n`
      );
    }
    return 0;
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
    skipConfirmation,
    asJson
  );
}

async function handleDisconnectProject(
  client: Client,
  resource: Resource,
  projectName: string,
  skipConfirmation: boolean,
  asJson: boolean
): Promise<number> {
  const project = resource.projectsMetadata?.find(
    project => projectName === project.name
  );
  if (!project) {
    output.error(
      `Project ${chalk.bold(projectName)} is not connected to resource ${chalk.bold(resource.name)}.`
    );
    output.log(
      `Run \`vercel integration list\` to see which projects are connected to each resource.`
    );
    return 1;
  }
  const projectConnections = resource.projectsMetadata!.filter(
    connection => connection.projectId === project.projectId
  );

  if (!skipConfirmation && client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          'Disconnecting a resource requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (
    !skipConfirmation &&
    !(await confirmDisconnectProject(
      client,
      resource,
      project,
      projectConnections.length
    ))
  ) {
    output.log('Canceled');
    return 0;
  }

  try {
    output.spinner('Disconnecting resource…', 500);
    for (const connection of projectConnections) {
      await disconnectResourceFromProject(client, resource, connection);
    }
  } catch (error) {
    output.error(
      `A problem occurred while disconnecting: ${(error as Error).message}`
    );
    return 1;
  }

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(
      `${JSON.stringify({ resource: resource.name, disconnected: true, projects: [projectName] }, null, 2)}\n`
    );
    return 0;
  }

  const connectionCount = projectConnections.length;
  output.success(
    connectionCount === 1
      ? `Disconnected ${chalk.bold(project.name)} from ${chalk.bold(resource.name)}`
      : `Disconnected all ${connectionCount} connections for ${chalk.bold(project.name)} from ${chalk.bold(resource.name)}`
  );
  return 0;
}

export async function handleDisconnectAllProjects(
  client: Client,
  resource: Resource,
  skipConfirmation: boolean,
  asJson = false
): Promise<void> {
  if (resource.projectsMetadata?.length === 0) {
    output.log(`${chalk.bold(resource.name)} has no projects to disconnect.`);
    return;
  }

  if (!skipConfirmation && client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          'Disconnecting all projects requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
    throw new FailedError(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
  }

  if (!skipConfirmation && !client.stdin.isTTY) {
    throw new FailedError(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
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
    if (asJson) {
      output.stopSpinner();
    } else {
      output.success(
        `Disconnected all projects from ${chalk.bold(resource.name)}`
      );
    }
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
  project: ResourceConnection,
  connectionCount: number
) {
  output.log(
    connectionCount === 1
      ? `The resource ${chalk.bold(resource.name)} will be disconnected from project ${chalk.bold(project.name)}.`
      : `All ${connectionCount} connections between resource ${chalk.bold(resource.name)} and project ${chalk.bold(project.name)} will be disconnected.`
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
