import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import type { Resource, ResourceConnection } from './types';
import { getResources } from '../../util/integration/get-resources';
import { removeSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import handleError from '../../util/handle-error';
import type { Team } from '@vercel-internals/types';
import { getFirstConfiguration } from '../../util/integration/fetch-marketplace-integrations';
import confirm from '../../util/input/confirm';
import { removeIntegration } from '../../util/integration/remove-integration';
import {
  disconnectResourceFromAllProjects,
  disconnectResourceFromProject,
} from '../../util/integration/disconnect-resource-from-project';
import { deleteResource } from '../../util/integration/delete-resource';

interface RemoveCommandFlags {
  '--delete'?: boolean | undefined;
  '--unlink-all'?: boolean | undefined;
  '--yes'?: boolean | undefined;
}

export async function remove(client: Client) {
  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);

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

  if (parsedArguments.args.length < 2) {
    client.output.error(
      'You must specify a resource or integration. See `--help` for details.'
    );
    return 1;
  }

  if (parsedArguments.args.length > 3) {
    client.output.error(
      'Cannot specify more than one project at a time. Use `--unlink-all` to unlink the specified resource from all projects.'
    );
    return 1;
  }

  if (
    parsedArguments.args.length === 3 &&
    parsedArguments.flags['--unlink-all']
  ) {
    client.output.error(
      'Cannot specify a project while using the `--unlink-all` flag.'
    );
    return 1;
  }

  const resourceOrIntegrationName = parsedArguments.args[1];
  const searchForIntegration =
    parsedArguments.args.length === 2 &&
    !parsedArguments.flags['--delete'] &&
    !parsedArguments.flags['--unlink-all'];

  if (searchForIntegration) {
    return await handleRemoveIntegration(
      client,
      team,
      resourceOrIntegrationName,
      !!parsedArguments.flags['--yes']
    );
  }

  return await handleUnlinkOrDeleteResource(
    client,
    team,
    resourceOrIntegrationName,
    parsedArguments.args,
    parsedArguments.flags
  );
}

// $ vc integration remove [integration-name]
async function handleRemoveIntegration(
  client: Client,
  team: Team,
  integrationName: string,
  skipConfirmation: boolean
): Promise<number> {
  client.output.spinner('Retrieving integration…', 500);
  const integrationConfiguration = await getFirstConfiguration(
    client,
    integrationName
  );

  if (!integrationConfiguration) {
    client.output.error(`No integration ${chalk.bold(integrationName)} found.`);
    return 0;
  }

  // Confirm removal desired
  if (
    !skipConfirmation &&
    !(await confirmIntegrationRemoval(
      client,
      integrationConfiguration.slug,
      team
    ))
  ) {
    client.output.log('Canceled');
    return 0;
  }

  // Uninstall Integration
  try {
    client.output.spinner('Uninstalling integration…', 1000);
    await removeIntegration(client, integrationConfiguration, team);
  } catch (error) {
    client.output.error(
      chalk.red(
        `Failed to remove ${chalk.bold(integrationName)}: ${(error as Error).message}`
      )
    );
    return 1;
  }

  client.output.success(`${chalk.bold(integrationName)} successfully removed.`);
  return 0;
}

async function handleUnlinkOrDeleteResource(
  client: Client,
  team: Team,
  resourceName: string,
  args: string[],
  flags: RemoveCommandFlags
): Promise<number> {
  client.output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client, team.id);
  const targetedResource = resources.find(
    resource => resource.name === resourceName
  );

  if (!targetedResource) {
    client.output.error(`No resource ${chalk.bold(resourceName)} found.`);
    return 0;
  }

  if (args.length === 3) {
    if (flags['--unlink-all']) {
      client.output.error(
        'Cannot specify a project when using the `--unlink-all` flag.'
      );
      return 1;
    }

    const unlinkProjectResults = await handleUnlinkProject(
      client,
      targetedResource,
      args[2],
      !!flags['--yes']
    );
    if (unlinkProjectResults !== undefined) {
      return unlinkProjectResults;
    }
  } else if (flags['--unlink-all']) {
    const unlinkAllResults = await handleUnlinkAllProjects(
      client,
      targetedResource,
      !!flags['--yes']
    );
    if (unlinkAllResults !== undefined) {
      return unlinkAllResults;
    }
  }

  if (flags['--delete']) {
    const deleteResult = await handleDeleteResource(
      client,
      team,
      targetedResource,
      !!flags['--yes']
    );
    if (deleteResult !== undefined) {
      return deleteResult;
    }
  }

  return 0;
}

// $ vc integration remove [resource-name] [project]
async function handleUnlinkProject(
  client: Client,
  resource: Resource,
  projectName: string,
  skipConfirmation: boolean
): Promise<number | undefined> {
  const project = resource.projectsMetadata?.find(
    project => projectName === project.name
  );
  if (!project) {
    client.output.log(
      `Could not find project ${chalk.bold(projectName)} linked to resource ${chalk.bold(resource.name)}.`
    );
    return 0;
  }

  if (
    !skipConfirmation &&
    !(await confirmUnlinkProject(client, resource, project))
  ) {
    client.output.log('Canceled');
    return 0;
  }

  try {
    client.output.spinner('Unlinking resource…', 500);
    await disconnectResourceFromProject(client, resource, project);
    client.output.success(
      `Unlinked ${chalk.bold(project.name)} from ${chalk.bold(resource.name)}`
    );
    resource.projectsMetadata = resource.projectsMetadata?.filter(
      project => projectName !== project.name
    );
  } catch (error) {
    client.output.error(
      `A problem occurred while unlinking: ${(error as Error).message}`
    );
    return 1;
  }

  return;
}

// $ vc integration remove [resource-name] --unlink-all
async function handleUnlinkAllProjects(
  client: Client,
  resource: Resource,
  skipConfirmation: boolean
): Promise<number | undefined> {
  if (resource.projectsMetadata?.length === 0) {
    client.output.log(
      `${chalk.bold(resource.name)} has no projects to unlink.`
    );
  } else {
    if (
      !skipConfirmation &&
      !(await confirmUnlinkAllProjects(client, resource))
    ) {
      client.output.log('Canceled');
      return 0;
    }

    try {
      client.output.spinner('Unlinking projects from resource…', 500);
      await disconnectResourceFromAllProjects(client, resource);
      client.output.success(
        `Unlinked all projects from ${chalk.bold(resource.name)}`
      );
      resource.projectsMetadata = [];
    } catch (error) {
      client.output.error(
        `A problem occurred while unlinking all projects: ${(error as Error).message}`
      );
      return 1;
    }
  }
}

// $ vc integration remove [resource-name] --delete
async function handleDeleteResource(
  client: Client,
  team: Team,
  resource: Resource,
  skipConfirmation: boolean
): Promise<number | undefined> {
  // Resources can't be deleted if they have projects
  if (resource.projectsMetadata && resource.projectsMetadata?.length > 0) {
    client.output.error(
      `Cannot delete resource ${chalk.bold(resource.name)} while it has linked projects. Please unlink any projects using this resource first or use the \`--unlink-all\` flag.`
    );
    return 1;
  }

  if (!skipConfirmation && !(await confirmDeleteResource(client, resource))) {
    client.output.log('Canceled');
    return 0;
  }

  try {
    client.output.spinner('Deleting resource…', 500);
    await deleteResource(client, resource, team);
    client.output.success(`${chalk.bold(resource.name)} successfully deleted.`);
  } catch (error) {
    client.output.error(
      `A problem occurred when attempting to delete ${chalk.bold(resource.name)}: ${(error as Error).message}`
    );
    return 1;
  }

  return;
}

async function confirmUnlinkProject(
  client: Client,
  resource: Resource,
  project: ResourceConnection
) {
  client.output.log(
    `The resource ${chalk.bold(resource.name)} will be unlinked from project ${chalk.bold(project.name)}.`
  );
  return confirm(client, `${chalk.red('Are you sure?')}`, false);
}

async function confirmUnlinkAllProjects(
  client: Client,
  resource: Resource
): Promise<boolean> {
  client.output.log('The following projects will be unlinked:');
  if (!resource.projectsMetadata) {
    return false;
  }
  for (const project of resource.projectsMetadata) {
    client.output.print(`  ${project.name}\n`);
  }
  return confirm(client, chalk.red('Are you sure?'), false);
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

async function confirmIntegrationRemoval(
  client: Client,
  integration: string,
  team: Team
): Promise<boolean> {
  client.output.log(
    `The ${chalk.bold(integration)} integration will be removed permanently from team ${chalk.bold(team.name)}.`
  );
  return confirm(client, `${chalk.red('Are you sure?')}`, false);
}
