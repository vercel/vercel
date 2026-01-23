import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { deleteFlag } from '../../util/flags/delete-flag';
import output from '../../output-manager';
import { FlagsRmTelemetryClient } from '../../util/telemetry/commands/flags/rm';
import { removeSubcommand } from './command';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const skipConfirmation = flags['--yes'] as boolean | undefined;

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to delete');
    output.log(`Example: ${getCommandName('flags rm my-feature')}`);
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
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
    // First, verify the flag exists
    output.spinner('Fetching flag...');
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    // Confirm deletion
    if (!skipConfirmation) {
      const confirmed = await confirm({
        message: `Are you sure you want to delete ${chalk.bold(flag.slug)}? This action cannot be undone.`,
        default: false,
      });

      if (!confirmed) {
        output.log('Aborted');
        return 0;
      }
    }

    // Delete the flag
    output.spinner('Deleting flag...');
    await deleteFlag(client, project.id, flagArg);
    output.stopSpinner();

    output.success(`Feature flag ${chalk.bold(flag.slug)} has been deleted`);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
