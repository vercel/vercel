import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import select from '@inquirer/select';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getSdkKeys, deleteSdkKey } from '../../util/flags/sdk-keys';
import output from '../../output-manager';
import { FlagsSdkKeysRmTelemetryClient } from '../../util/telemetry/commands/flags/sdk-keys';
import { sdkKeysRemoveSubcommand } from './command';

export default async function sdkKeysRm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSdkKeysRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sdkKeysRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  let [hashKey] = args;
  const skipConfirmation = flags['--yes'] as boolean | undefined;

  telemetryClient.trackCliArgumentKey(hashKey);
  telemetryClient.trackCliFlagYes(skipConfirmation);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    // If no hash key provided, let user select from existing keys
    if (!hashKey) {
      output.spinner('Fetching SDK keys...');
      const keys = await getSdkKeys(client, project.id);
      output.stopSpinner();

      if (keys.length === 0) {
        output.log('No SDK keys found');
        return 0;
      }

      hashKey = await select({
        message: 'Select an SDK key to delete:',
        choices: keys.map(key => ({
          name: `${key.hashKey.slice(0, 12)}... (${key.type}, ${key.environment}${key.label ? `, ${key.label}` : ''})`,
          value: key.hashKey,
        })),
      });
    }

    // Confirm deletion
    if (!skipConfirmation) {
      const confirmed = await confirm({
        message: `Are you sure you want to delete SDK key ${chalk.bold(hashKey.slice(0, 12) + '...')}?`,
        default: false,
      });

      if (!confirmed) {
        output.log('Aborted');
        return 0;
      }
    }

    output.spinner('Deleting SDK key...');
    await deleteSdkKey(client, project.id, hashKey);
    output.stopSpinner();

    output.success(
      `SDK key ${chalk.bold(hashKey.slice(0, 12) + '...')} has been deleted`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
