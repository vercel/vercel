import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import type { Resource } from '../../util/integration-resource/types';
import { getResources } from '../../util/integration-resource/get-resources';
import { listSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import table from '../../util/output/table';
import title from 'title';
import type { Team } from '@vercel-internals/types';
import { buildSSOLink } from '../../util/integration/build-sso-link';
import { IntegrationListTelemetryClient } from '../../util/telemetry/commands/integration/list';
import output from '../../output-manager';

export async function list(client: Client) {
  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(3), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new IntegrationListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  telemetry.trackCliArgumentProject(parsedArguments.args[1]);
  telemetry.trackCliFlagAll(parsedArguments.flags['--all']);
  // Note: the `--integration` flag is tracked later, after validating
  // whether the value is a known integration name or not.

  if (parsedArguments.args.length > 2) {
    output.error(
      'Cannot specify more than one project at a time. Use `--all` to show all resources.'
    );
    return 1;
  }

  let project: { id?: string; name?: string } | undefined;

  if (parsedArguments.args.length === 2) {
    if (parsedArguments.flags['--all']) {
      output.error('Cannot specify a project when using the `--all` flag.');
      return 1;
    }

    project = { name: parsedArguments.args[1] };
  }

  const { contextName, team } = await getScope(client);

  if (!team) {
    output.error('Team not found.');
    return 1;
  }

  if (!project && !parsedArguments.flags['--all']) {
    project = await getLinkedProject(client).then(result => {
      if (result.status === 'linked') {
        return result.project;
      }
      return;
    });
    if (!project) {
      output.error(
        'No project linked. Either use `vc link` to link a project, or the `--all` flag to list all resources.'
      );
      return 1;
    }
  }

  let resources: Resource[] | undefined;

  try {
    output.spinner('Retrieving resources…', 500);
    resources = await getResources(client, team.id);
  } catch (error) {
    output.error(`Failed to fetch resources: ${(error as Error).message}`);
    return 1;
  }

  const filterIntegration =
    parsedArguments.flags['--integration']?.toLocaleLowerCase();

  function resourceIsFromMarketplace(resource: Resource): boolean {
    return resource.type === 'integration';
  }

  let knownIntegration = false;

  function filterOnIntegration(resource: Resource): boolean {
    if (!filterIntegration) return true;
    const match = filterIntegration === resource.product?.slug;
    if (match) knownIntegration = true;
    return match;
  }

  function filterOnProject(resource: Resource): boolean {
    return (
      !project ||
      !!resource.projectsMetadata?.find(
        metadata =>
          metadata.projectId === project?.id || metadata.name === project?.name
      )
    );
  }

  function filterOnFlags(resource: Resource): boolean {
    return filterOnIntegration(resource) && filterOnProject(resource);
  }

  const results = resources
    .filter(resourceIsFromMarketplace)
    .filter(filterOnFlags)
    .map(resource => {
      return {
        id: resource.id,
        name: resource.name,
        status: resource.status,
        product: resource.product?.name,
        integration: resource.product?.slug,
        configurationId: resource.product?.integrationConfigurationId,
        projects: resource.projectsMetadata
          ?.map(metadata => metadata.name)
          .join(', '),
      };
    });

  telemetry.trackCliOptionIntegration(
    parsedArguments.flags['--integration'],
    knownIntegration
  );

  if (results.length === 0) {
    output.log('No resources found.');
    return 0;
  }

  output.log(
    `Integrations in ${chalk.bold(contextName)}:\n${table(
      [
        ['Name', 'Status', 'Product', 'Integration', 'Projects'].map(header =>
          chalk.bold(chalk.cyan(header))
        ),
        ...results.map(result => [
          resourceLink(contextName, result) ?? chalk.gray('–'),
          resourceStatus(result.status ?? '–'),
          result.product ?? chalk.gray('–'),
          integrationLink(result, team) ?? chalk.gray('–'),
          chalk.grey(result.projects ? result.projects : '–'),
        ]),
      ],
      { hsep: 8 }
    )}`
  );
  return 0;
}

// Builds a string with an appropriately coloured indicator
function resourceStatus(status: string) {
  const CIRCLE = '● ';
  const statusTitleCase = title(status);
  switch (status) {
    case 'initializing':
      return chalk.yellow(CIRCLE) + statusTitleCase;
    case 'error':
      return chalk.red(CIRCLE) + statusTitleCase;
    case 'available':
      return chalk.green(CIRCLE) + statusTitleCase;
    case 'suspended':
      return chalk.white(CIRCLE) + statusTitleCase;
    case 'limits-exceeded-suspended':
      return `${chalk.white(CIRCLE)}Limits exceeded`;
    default:
      return chalk.gray(statusTitleCase);
  }
}

// Builds a deep link to the vercel dashboard resource page
function resourceLink(
  orgSlug: string,
  resource: { id: string; name?: string }
): string | undefined {
  if (!resource.name) {
    return;
  }

  const projectUrl = `https://vercel.com/${orgSlug}/~`;
  return output.link(
    resource.name,
    `${projectUrl}/stores/integration/${resource.id}`,
    { fallback: () => resource.name ?? '–', color: false }
  );
}

// Builds a deep link to the integration dashboard
function integrationLink(
  integration: { integration?: string; configurationId?: string },
  team: Team
): string | undefined {
  if (!integration.integration) {
    return;
  }

  if (!integration.configurationId) {
    return integration.integration;
  }

  const boldName = chalk.bold(integration.integration);
  const integrationDeepLink = buildSSOLink(team, integration.configurationId);
  return output.link(boldName, integrationDeepLink, {
    fallback: () => boldName,
    color: false,
  });
}
