import type { Team } from '@vercel-internals/types';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { getFirstConfiguration } from '../../util/integration/fetch-marketplace-integrations';
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

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }

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
  const skipConfirmation = !!parsedArguments.flags['--yes'];
  telemetry.trackCliFlagYes(skipConfirmation);

  output.spinner('Retrieving integration…', 500);
  const integrationConfiguration = await getFirstConfiguration(
    client,
    integrationName
  );
  output.stopSpinner();

  if (!integrationConfiguration) {
    output.error(`No integration ${chalk.bold(integrationName)} found.`);
    telemetry.trackCliArgumentIntegration(integrationName, false);
    return 0;
  }
  telemetry.trackCliArgumentIntegration(integrationName, true);

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
    await removeIntegration(client, integrationConfiguration, team);
  } catch (error) {
    output.error(
      chalk.red(
        `Failed to remove ${chalk.bold(integrationName)}: ${(error as Error).message}`
      )
    );
    return 1;
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
