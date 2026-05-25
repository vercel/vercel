import type { Team } from '@vercel-internals/types';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { getFirstConfiguration } from '../../util/integration/fetch-marketplace-integrations';
import type { Resource } from '../../util/integration-resource/types';
import { packageName } from '../../util/pkg-name';
import { removeIntegration } from '../../util/integration/remove-integration';
import { removeSubcommand } from './command';
import { IntegrationRemoveTelemetryClient } from '../../util/telemetry/commands/integration/remove';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';

export async function remove(client: Client, argv: string[]) {
  const telemetry = new IntegrationRemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);

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

  const skipConfirmation = !!parsedArguments.flags['--yes'];

  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);

  if (asJson && !skipConfirmation) {
    output.error('--format=json requires --yes to skip confirmation prompts');
    return 1;
  }

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }
  client.config.currentTeam = team.id;

  const isMissingIntegrationSlug = parsedArguments.args.length < 1;
  if (isMissingIntegrationSlug) {
    const message =
      'You must specify an integration. See `--help` for details.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message,
        hint: `Put global flags (\`--cwd\`, \`--non-interactive\`, etc.) first, then \`integration remove <slug> --yes\`. Replace \`<slug>\` with your integration; non-interactive removal requires \`--yes\`.`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration installations',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'List integration slugs for this team',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration remove <slug> --yes',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'Substitute your integration slug for <slug> (angle brackets are not part of the command)',
          },
        ],
      },
      1
    );
    output.error(message);
    return 1;
  }

  const hasTooManyArguments = parsedArguments.args.length > 1;
  if (hasTooManyArguments) {
    const message = 'Cannot specify more than one integration at a time.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
        hint: `Use one slug only: \`${packageName} [global flags] integration remove <slug> --yes\`. Global flags belong before \`integration\`.`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration remove <slug> --yes',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'Single slug in place of <slug>; keep one integration remove invocation',
          },
        ],
      },
      1
    );
    output.error(message);
    return 1;
  }

  const integrationName = parsedArguments.args[0];

  output.spinner('Retrieving integration…', 500);
  const integrationConfiguration = await getFirstConfiguration(
    client,
    integrationName
  );
  output.stopSpinner();

  if (!integrationConfiguration) {
    output.error(`No integration ${chalk.bold(integrationName)} found.`);
    telemetry.trackCliArgumentIntegration(integrationName, false);
    return 1;
  }
  telemetry.trackCliArgumentIntegration(integrationName, true);

  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  const userDidNotConfirm =
    !skipConfirmation &&
    !(await confirmIntegrationRemoval(
      client,
      integrationConfiguration.slug,
      team
    ));

  if (userDidNotConfirm) {
    output.log('Canceled');
    return 0;
  }

  try {
    output.spinner('Uninstalling integration…', 1000);
    await removeIntegration(client, integrationConfiguration);
  } catch (error) {
    if (
      isAPIError(error) &&
      error.status === 403 &&
      error.serverMessage.includes('resources')
    ) {
      let resourceNames: string[] = [];
      try {
        const searchParams = new URLSearchParams();
        searchParams.set('teamId', team.id);
        searchParams.set(
          'integrationConfigurationId',
          integrationConfiguration.id
        );
        searchParams.set('skip-metadata', 'true');
        const { stores } = await client.fetch<{ stores: Resource[] }>(
          `/v1/storage/stores?${searchParams}`,
          { json: true }
        );
        resourceNames = stores.map(s => s.name);
      } catch {
        // Ignore errors fetching resources; the actionable guidance below is still useful.
      }

      const emitStructuredHasResources =
        asJson || shouldEmitNonInteractiveCommandError(client);

      if (emitStructuredHasResources) {
        output.stopSpinner();
        const approvalHint =
          'Remove each resource with --disconnect-all (non-interactive: include --yes). Get user approval before destructive resource removal.';
        const resourceTail = asJson
          ? '--disconnect-all --yes --format=json'
          : '--disconnect-all --yes';
        const integrationRemoveTail = asJson ? `--yes --format=json` : '--yes';
        /** Template already includes `--yes`; omit it from prepended globals to avoid duplicates. */
        const suggestNextOpts = {
          prependGlobalFlags: true as const,
          excludeFlags: ['--yes', '-y'],
        };
        const payload = {
          status: 'error' as const,
          reason: AGENT_REASON.HAS_RESOURCES,
          integration: integrationName,
          removed: false,
          error: 'has_resources',
          message: `Cannot uninstall ${integrationName} because it still has resources.`,
          resources: resourceNames,
          hint: client.isAgent
            ? `${approvalHint} Agents must obtain explicit user approval before running integration-resource remove.`
            : approvalHint,
          userActionRequired: client.isAgent ? true : undefined,
          next: resourceNames.map(name => ({
            command: buildCommandWithGlobalFlags(
              client.argv,
              `integration-resource remove ${name} ${resourceTail}`,
              packageName,
              suggestNextOpts
            ),
            when: `Disconnect and remove resource ${name}; substitute the real resource name if different`,
          })),
          retry: buildCommandWithGlobalFlags(
            client.argv,
            `integration remove ${integrationName} ${integrationRemoveTail}`,
            packageName,
            suggestNextOpts
          ),
        };
        client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 1;
      }

      output.error(
        `Cannot uninstall ${chalk.bold(integrationName)} because it still has resources.`
      );

      if (resourceNames.length > 0) {
        output.log('');
        output.log('Resources that must be removed first:');
        for (const name of resourceNames) {
          output.log(`  ${chalk.gray('-')} ${name}`);
        }
        output.log('');
      }

      if (client.isAgent) {
        output.log(
          'AGENT: You must get user approval before running any resource removal commands.'
        );
      }
      output.log(
        `Remove and disconnect all resources first with: ${chalk.cyan(`${packageName} integration-resource remove <resource-name> --disconnect-all`)}`
      );
      output.log(
        `Then retry: ${chalk.cyan(`${packageName} integration remove ${integrationName}`)}`
      );
      return 1;
    }

    output.error(
      chalk.red(
        `Failed to remove ${chalk.bold(integrationName)}: ${(error as Error).message}`
      )
    );
    return 1;
  }

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(
      `${JSON.stringify({ integration: integrationName, removed: true }, null, 2)}\n`
    );
    return 0;
  }

  output.success(`${chalk.bold(integrationName)} successfully removed.`);
  return 0;
}

async function confirmIntegrationRemoval(
  client: Client,
  integration: string,
  team: Team
): Promise<boolean> {
  output.log(
    `The ${chalk.bold(integration)} integration will be removed permanently from team ${chalk.bold(team.name)}.`
  );
  return client.input.confirm(`${chalk.red('Are you sure?')}`, false);
}
