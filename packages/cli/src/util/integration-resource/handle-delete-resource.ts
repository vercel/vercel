import type { Team } from '@vercel-internals/types';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../client';
import { deleteResource } from './delete-resource';
import type { Resource } from './types';

export async function handleDeleteResource(
  client: Client,
  team: Team,
  resource: Resource,
  options?: {
    skipConfirmation: boolean;
    skipProjectCheck: boolean;
  }
): Promise<number> {
  const hasProjects =
    resource.projectsMetadata && resource.projectsMetadata.length > 0;
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
    await deleteResource(client, resource, team);
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
