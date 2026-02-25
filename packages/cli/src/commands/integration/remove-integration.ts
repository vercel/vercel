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

export async function remove(client: Client) {
  const telemetry = new IntegrationRemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);

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

  const isMissingResourceOrIntegration = parsedArguments.args.length < 2;
  if (isMissingResourceOrIntegration) {
    output.error('You must specify an integration. See `--help` for details.');
    return 1;
  }

  const hasTooManyArguments = parsedArguments.args.length > 2;
  if (hasTooManyArguments) {
    output.error('Cannot specify more than one integration at a time.');
    return 1;
  }

  const integrationName = parsedArguments.args[1];

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
      output.error(
        `Cannot uninstall ${chalk.bold(integrationName)} because it still has resources.`
      );

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
        if (stores.length > 0) {
          output.log('');
          output.log('Resources that must be removed first:');
          for (const resource of stores) {
            output.log(`  ${chalk.gray('-')} ${resource.name}`);
          }
          output.log('');
        }
      } catch {
        // Ignore errors fetching resources; the actionable guidance below is still useful.
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
