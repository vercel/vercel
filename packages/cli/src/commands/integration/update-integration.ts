import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getScope from '../../util/get-scope';
import { validateJsonOutput } from '../../util/output-format';
import { fetchMarketplaceIntegrations } from '../../util/integration/fetch-marketplace-integrations';
import type { Configuration } from '../../util/integration/types';
import { patchIntegrationConfiguration } from '../../util/integration/patch-integration-configuration';
import { updateSubcommand } from './command';
import { IntegrationUpdateTelemetryClient } from '../../util/telemetry/commands/integration/update';

function selectConfiguration(
  configurations: Configuration[],
  integrationSlug: string,
  installationId: string | undefined
): { ok: true; configuration: Configuration } | { ok: false; message: string } {
  if (configurations.length === 0) {
    return {
      ok: false,
      message: `No integration ${chalk.bold(integrationSlug)} found.`,
    };
  }

  if (installationId) {
    const found = configurations.find(c => c.id === installationId);
    if (!found) {
      const known = configurations.map(c => c.id).join(', ');
      return {
        ok: false,
        message: `No installation matching --installation-id ${installationId}. Known configuration IDs: ${known}`,
      };
    }
    return { ok: true, configuration: found };
  }

  if (configurations.length > 1) {
    const list = configurations.map(c => c.id).join(', ');
    return {
      ok: false,
      message: `Multiple installations found for "${integrationSlug}": ${list}\n\nRe-run with ${chalk.cyan('--installation-id <id>')} to select one.`,
    };
  }

  return { ok: true, configuration: configurations[0] };
}

function buildProjectsBody(
  raw: string[] | undefined
): { projects: 'all' | string[] } | { error: string } {
  if (!raw || raw.length === 0) {
    return {
      error:
        'Expected at least one --projects value (use "all" or project IDs).',
    };
  }
  if (raw.length === 1 && raw[0] === 'all') {
    return { projects: 'all' };
  }
  if (raw.includes('all')) {
    return {
      error:
        'Cannot mix "all" with specific project IDs. Use only --projects all, or repeat --projects for each project ID.',
    };
  }
  return { projects: raw };
}

export async function update(client: Client) {
  const telemetry = new IntegrationUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
  try {
    parsedArguments = parseArguments(client.argv.slice(3), flagsSpecification);
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

  if (parsedArguments.args.length < 2) {
    output.error('You must specify an integration. See `--help` for details.');
    return 1;
  }
  if (parsedArguments.args.length > 2) {
    output.error('Cannot specify more than one integration at a time.');
    return 1;
  }

  const integrationSlug = parsedArguments.args[1];
  const plan = parsedArguments.flags['--plan'] as string | undefined;
  const authorizationId = parsedArguments.flags['--authorization-id'] as
    | string
    | undefined;
  const projectsRaw = parsedArguments.flags['--projects'] as
    | string[]
    | undefined;
  const installationId = parsedArguments.flags['--installation-id'] as
    | string
    | undefined;

  const hasPlan = plan !== undefined;
  const projectsOutcome =
    projectsRaw !== undefined ? buildProjectsBody(projectsRaw) : null;

  if (hasPlan && projectsRaw !== undefined && projectsRaw.length > 0) {
    output.error(
      'Pass either --plan or --projects, not both. See `--help` for examples.'
    );
    return 1;
  }
  if (!hasPlan && !projectsOutcome) {
    output.error(
      'Nothing to update. Pass --plan to change billing plan, or --projects to change project access.'
    );
    return 1;
  }
  if (projectsOutcome && 'error' in projectsOutcome) {
    output.error(projectsOutcome.error);
    return 1;
  }

  const hasProjects = Boolean(projectsOutcome && !('error' in projectsOutcome));

  telemetry.trackCliOptionPlan(plan);
  telemetry.trackCliOptionAuthorizationId(authorizationId);
  telemetry.trackCliOptionProjects(projectsRaw);
  telemetry.trackCliOptionInstallationId(installationId);
  telemetry.trackCliOptionFormat(
    parsedArguments.flags['--format'] as string | undefined
  );

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }
  client.config.currentTeam = team.id;

  output.spinner('Retrieving integration…', 500);
  const configurations = await fetchMarketplaceIntegrations(
    client,
    integrationSlug
  );
  output.stopSpinner();

  const selected = selectConfiguration(
    configurations,
    integrationSlug,
    installationId
  );
  if (!selected.ok) {
    output.error(selected.message);
    telemetry.trackCliArgumentIntegration(integrationSlug, false);
    return 1;
  }
  telemetry.trackCliArgumentIntegration(integrationSlug, true);

  const body = hasPlan
    ? {
        billingPlanId: plan!,
        ...(authorizationId ? { authorizationId } : {}),
      }
    : (projectsOutcome as { projects: 'all' | string[] });

  try {
    output.spinner('Updating integration…', 1000);
    await patchIntegrationConfiguration(
      client,
      selected.configuration.id,
      body
    );
    output.stopSpinner();
  } catch (error) {
    output.stopSpinner();
    output.error(
      chalk.red(
        `Failed to update ${chalk.bold(integrationSlug)}: ${(error as Error).message}`
      )
    );
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          integration: integrationSlug,
          configurationId: selected.configuration.id,
          updated: true,
          ...(hasPlan ? { billingPlanId: plan } : {}),
          ...(hasProjects
            ? { projects: (body as { projects: 'all' | string[] }).projects }
            : {}),
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `${chalk.bold(integrationSlug)} installation updated successfully.`
  );
  return 0;
}
