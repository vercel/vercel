import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import type { Resource } from './types';
import { getResources } from '../../util/integration/get-resources';
import { listSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import handleError from '../../util/handle-error';
import table from '../../util/output/table';

export async function list(client: Client) {
  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(3), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { contextName, team } = await getScope(client);

  if (!team) {
    client.output.error('Team not found');
    return 1;
  }

  const project = await getLinkedProject(client).then(result => {
    if (result.status === 'linked') {
      return result.project;
    }

    return null;
  });

  if (parsedArguments.flags['--current-project'] && !project) {
    client.output.error(
      'Cannot filter on current project: project is not linked'
    );
    return 1;
  }

  let resources: Resource[] | undefined;

  try {
    client.output.spinner('Retrieving resources…', 1000);
    resources = await getResources(client, team.id);
  } catch (error) {
    client.output.error(
      `Failed to fetch resources: ${(error as Error).message}`
    );
    return 1;
  }

  const filterIntegration =
    parsedArguments.flags['--integration']?.toLocaleLowerCase();
  const currentProject = parsedArguments.flags['--current-project']
    ? project?.id
    : undefined;

  function resourceIsFromMarketplace(resource: Resource): boolean {
    return resource.type === 'integration';
  }

  function filterOnIntegration(resource: Resource): boolean {
    return !filterIntegration || filterIntegration === resource.product?.slug;
  }

  function filterOnCurrentProject(resource: Resource): boolean {
    return (
      !currentProject ||
      !!resource.projectsMetadata?.find(
        metadata => metadata.projectId === project?.id
      )
    );
  }

  function filterOnFlags(resource: Resource): boolean {
    return filterOnIntegration(resource) && filterOnCurrentProject(resource);
  }

  const results = resources
    .filter(resourceIsFromMarketplace)
    .filter(filterOnFlags)
    .map(resource => {
      return {
        name: resource.name,
        status: resource.status,
        product: resource.product?.name,
        integration: resource.product?.slug,
        projects: resource.projectsMetadata
          ?.map(metadata => metadata.name)
          .join(', '),
      };
    });

  client.output.log(
    `Integrations in ${chalk.bold(contextName)}:\n${table(
      [
        ['Name', 'Status', 'Product', 'Integration', 'Projects'].map(header =>
          chalk.gray(header)
        ),
        ...results.map(result => [
          result.name ?? chalk.gray('–'),
          result.status ?? chalk.gray('–'),
          result.product ?? chalk.gray('–'),
          result.integration ?? chalk.gray('–'),
          result.projects ? result.projects : chalk.gray('–'),
        ]),
      ],
      { hsep: 8 }
    )}`
  );
  return 0;
}
