import chalk from 'chalk';
import title from 'title';
import type { Team } from '@vercel-internals/types';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { getResources } from '../../util/integration-resource/get-resources';
import { getResource } from '../../util/integration-resource/get-resource';
import { isSandboxResource } from '../../util/integration-resource/claim-status';
import {
  resourceDashboardUrl,
  resourceStatus,
} from '../../util/integration-resource/format';
import { buildSSOLink } from '../../util/integration/build-sso-link';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { packageName } from '../../util/pkg-name';
import { IntegrationResourceInspectTelemetryClient } from '../../util/telemetry/commands/integration-resource/inspect';
import type { Resource } from '../../util/integration-resource/types';
import { inspectSubcommand } from './command';

export async function inspect(client: Client, argv: string[]) {
  const telemetry = new IntegrationResourceInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);

  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);

  if (parsedArguments.args.length > 1) {
    output.error(
      'Too many arguments. Usage: `vercel integration resource inspect <resource>`.'
    );
    return 1;
  }

  const resourceName: string | undefined = parsedArguments.args[0];
  telemetry.trackCliArgumentResource(resourceName);

  if (!resourceName) {
    output.error('You must specify a resource. See `--help` for details.');
    return 1;
  }

  const { contextName, team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }
  client.config.currentTeam = team.id;

  output.spinner('Retrieving resource…', 500);
  let resources: Resource[];
  try {
    resources = await getResources(client);
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to fetch resources: ${(error as Error).message}`);
    return 1;
  }

  const listed = resources.find(
    resource =>
      resource.type === 'integration' && resource.name === resourceName
  );

  if (!listed) {
    output.stopSpinner();
    output.error(`No resource ${chalk.bold(resourceName)} found.`);
    return 1;
  }

  // Live fetch from the partner via the per-store endpoint. Merge so live
  // status/ownership win while list-only fields (e.g. projectsMetadata) survive
  // if the live payload omits them.
  let resource: Resource;
  try {
    const live = await getResource(client, listed.id);
    resource = { ...listed, ...live };
  } catch (error) {
    output.stopSpinner();
    output.error(
      `Failed to fetch live status for ${chalk.bold(resourceName)}: ${(error as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  const isSandbox = isSandboxResource(resource);
  const dashboardUrl = resourceDashboardUrl(contextName, resource.id);

  if (asJson) {
    const json = {
      resource: {
        id: resource.id,
        name: resource.name,
        status: resource.status ?? null,
        ownership: resource.ownership ?? null,
        product: resource.product?.name ?? null,
        integration: resource.product?.slug ?? null,
        installationId: resource.product?.integrationConfigurationId ?? null,
        projects:
          resource.projectsMetadata?.map(project => ({
            id: project.projectId,
            name: project.name,
            environments: project.environments,
          })) ?? [],
        billingPlan: resource.billingPlan
          ? {
              id: resource.billingPlan.id,
              name: resource.billingPlan.name,
              type: resource.billingPlan.type,
              scope: resource.billingPlan.scope,
            }
          : null,
        dashboard: dashboardUrl,
        ...(isSandbox ? { claim_status: 'sandbox' } : {}),
      },
    };
    client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    return 0;
  }

  output.log(
    `Resource ${chalk.bold(resource.name)} in ${chalk.bold(contextName)}:`
  );
  output.print('\n');

  printAlignedLabel(
    'Status',
    resourceStatus(resource.status ?? '–', isSandbox)
  );
  if (resource.ownership) {
    printAlignedLabel('Ownership', title(resource.ownership));
  }
  if (resource.product?.name) {
    const productSlug = resource.product.slug
      ? chalk.gray(` (${resource.product.slug})`)
      : '';
    printAlignedLabel('Product', `${resource.product.name}${productSlug}`);
  }
  const integration = integrationLink(resource, team);
  if (integration) {
    printAlignedLabel('Integration', integration);
  }
  if (resource.billingPlan) {
    const { name, type, scope } = resource.billingPlan;
    const meta = [type, scope].filter(Boolean).join(' · ');
    printAlignedLabel('Plan', meta ? `${name} · ${meta}` : name);
  }
  printAlignedLabel('Resource ID', chalk.gray(resource.id));
  printAlignedLabel(
    'Dashboard',
    output.link(dashboardUrl, dashboardUrl, { fallback: false })
  );

  const projects = resource.projectsMetadata ?? [];
  output.print('\n');
  if (projects.length === 0) {
    output.log(chalk.gray('No connected projects.'));
  } else {
    output.log('Connected projects:');
    for (const project of projects) {
      const envs = project.environments?.length
        ? chalk.gray(` (${project.environments.join(', ')})`)
        : '';
      output.print(`  ${project.name}${envs}\n`);
    }
  }

  if (isSandbox) {
    output.print('\n');
    output.log(
      `This is a sandbox resource. Run \`${packageName} integration resource claim ${resource.name}\` to claim it.`
    );
  }

  return 0;
}

// Builds a deep link to the integration dashboard for a resource.
function integrationLink(resource: Resource, team: Team): string | undefined {
  const slug = resource.product?.slug;
  if (!slug) {
    return;
  }

  const configurationId = resource.product?.integrationConfigurationId;
  if (!configurationId) {
    return slug;
  }

  const boldName = chalk.bold(slug);
  return output.link(boldName, buildSSOLink(team, configurationId), {
    fallback: () => boldName,
    color: false,
  });
}
