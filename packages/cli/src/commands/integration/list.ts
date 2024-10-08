/*
    const url = new URL(`${VERCEL_API_URL}/v1/storage/stores`);

    url.searchParams.append('skip-metadata', 'true');

    if (teamId) {
      url.searchParams.append('teamId', teamId);
    }

    const endpoint = url.toString();
*/

import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import type { Store } from './types';
import { getStores } from './client';
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

  if (parsedArguments.flags['--currentProject'] && !project) {
    client.output.error(
      'Cannot filter on current project: project is not linked'
    );
    return 1;
  }

  let resources: Store[] | undefined;

  try {
    resources = await getStores(client, team.id);
  } catch (error) {
    client.output.error(JSON.stringify(error, null, 2));
    return 1;
  }

  const filterIntegration =
    parsedArguments.flags['--integration']?.toLocaleLowerCase();
  const currentProject = parsedArguments.flags['--currentProject']
    ? project?.id
    : null;

  function resourceIsFromMarketplace(resource: Store): boolean {
    return resource.type === 'integration';
  }

  function filterOnIntegration(resource: Store): boolean {
    return !filterIntegration || filterIntegration === resource.product?.slug;
  }

  function filterOnCurrentProject(resource: Store): boolean {
    return (
      !!currentProject &&
      !!resource.projectsMetadata?.find(
        metadata => metadata.projectId === project?.id
      )
    );
  }

  const results = resources
    .filter(
      resource =>
        resourceIsFromMarketplace(resource) &&
        filterOnIntegration(resource) &&
        filterOnCurrentProject(resource)
    )
    .map(store => {
      return {
        name: store.name,
        status: store.status,
        product: store.product?.name,
        integration: store.product?.slug,
        projects: store.projectsMetadata
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
