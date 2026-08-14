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
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import { packageName } from '../../util/pkg-name';

type SelectResult =
  | { ok: true; configuration: Configuration }
  | { ok: false; message: string; reason: string };

function selectConfiguration(
  configurations: Configuration[],
  integrationSlug: string,
  installationId: string | undefined
): SelectResult {
  if (configurations.length === 0) {
    return {
      ok: false,
      reason: AGENT_REASON.NOT_FOUND,
      message: `No integration "${integrationSlug}" found.`,
    };
  }

  if (installationId) {
    const found = configurations.find(c => c.id === installationId);
    if (!found) {
      const known = configurations.map(c => c.id).join(', ');
      return {
        ok: false,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `No installation matching --installation-id ${installationId}. Known configuration IDs: ${known}`,
      };
    }
    return { ok: true, configuration: found };
  }

  if (configurations.length > 1) {
    const list = configurations.map(c => c.id).join(', ');
    return {
      ok: false,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `Multiple installations found for "${integrationSlug}": ${list}. Re-run with --installation-id <id> to select one. Run \`${packageName} integration installations\` to list installation IDs for this team.`,
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

/** Stderr for humans; JSON on stdout when `--non-interactive` (agent-style). */
function emitUpdateCliError(
  client: Client,
  message: string,
  reason: string,
  exitCode: number,
  extra?: {
    next?: Array<{ command: string; when?: string }>;
    hint?: string;
  }
): void {
  outputAgentError(
    client,
    {
      status: 'error',
      reason,
      message,
      ...extra,
    },
    exitCode
  );
  output.error(message);
}

export async function update(client: Client, argv: string[]) {
  const telemetry = new IntegrationUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      },
      1
    );
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    emitUpdateCliError(
      client,
      formatResult.error,
      AGENT_REASON.INVALID_ARGUMENTS,
      1
    );
    return 1;
  }

  const preferJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  const plan = parsedArguments.flags['--plan'] as string | undefined;
  const projectsRaw = parsedArguments.flags['--projects'] as
    | string[]
    | undefined;
  const authorizationId = parsedArguments.flags['--authorization-id'] as
    | string
    | undefined;
  const installationId = parsedArguments.flags['--installation-id'] as
    | string
    | undefined;

  if (parsedArguments.args.length < 1) {
    const hadSubcommandOptsFirst =
      (projectsRaw !== undefined && projectsRaw.length > 0) ||
      plan !== undefined;
    const msg = hadSubcommandOptsFirst
      ? `Put the integration slug immediately after \`update\`, before \`--projects\`, \`--plan\`, or other subcommand options. Example: \`${packageName} integration update neon --projects all\`.`
      : `You must specify an integration slug after \`update\`. Example: \`${packageName} integration update neon --projects all\` or \`${packageName} integration update neon --plan <plan-id>\`.`;

    emitUpdateCliError(client, msg, AGENT_REASON.MISSING_ARGUMENTS, 1, {
      hint: hadSubcommandOptsFirst
        ? `You used \`--projects\` or \`--plan\` without a preceding integration name. Use \`${packageName} integration update <integration> --projects …\`. Global flags such as \`--cwd\` may appear anywhere.`
        : `Run \`${packageName} integration installations\` to list slugs and installation IDs for your team.`,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'integration update neon --projects all',
            packageName,
            { prependGlobalFlags: true }
          ),
          when: 'Correct order: integration slug first, then --projects (replace neon)',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'integration installations',
            packageName,
            { prependGlobalFlags: true }
          ),
          when: 'Discover which integration slug to use',
        },
      ],
    });
    return 1;
  }
  if (parsedArguments.args.length > 1) {
    emitUpdateCliError(
      client,
      'Cannot specify more than one integration at a time.',
      AGENT_REASON.INVALID_ARGUMENTS,
      2
    );
    return 2;
  }

  const integrationSlug = parsedArguments.args[0];

  const hasPlan = plan !== undefined;
  const projectsOutcome =
    projectsRaw !== undefined ? buildProjectsBody(projectsRaw) : null;

  if (hasPlan && projectsRaw !== undefined && projectsRaw.length > 0) {
    emitUpdateCliError(
      client,
      'Pass either --plan or --projects, not both. See `vercel integration update --help`.',
      AGENT_REASON.INVALID_ARGUMENTS,
      1
    );
    return 1;
  }
  if (!hasPlan && !projectsOutcome) {
    emitUpdateCliError(
      client,
      'Nothing to update. Pass --plan to change billing plan, or --projects to change project access.',
      AGENT_REASON.MISSING_ARGUMENTS,
      1,
      {
        hint: `Example: \`${packageName} integration update ${integrationSlug} --projects all\``,
      }
    );
    return 1;
  }
  if (projectsOutcome && 'error' in projectsOutcome) {
    emitUpdateCliError(
      client,
      projectsOutcome.error,
      AGENT_REASON.INVALID_ARGUMENTS,
      1
    );
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
    emitUpdateCliError(
      client,
      'Team not found.',
      AGENT_REASON.MISSING_SCOPE,
      1,
      {
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'teams switch',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'Switch to a team that has this integration',
          },
        ],
      }
    );
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
    emitUpdateCliError(client, selected.message, selected.reason, 1);
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
    const apiMsg = isAPIError(error)
      ? error.serverMessage || error.message
      : (error as Error).message;
    emitUpdateCliError(
      client,
      `Failed to update ${integrationSlug}: ${apiMsg}`,
      AGENT_REASON.API_ERROR,
      1
    );
    return 1;
  }

  if (preferJson) {
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
