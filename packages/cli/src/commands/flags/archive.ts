import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import output from '../../output-manager';
import { FlagsArchiveTelemetryClient } from '../../util/telemetry/commands/flags/archive';
import { archiveSubcommand } from './command';

export default async function archive(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsArchiveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(archiveSubcommand.options);
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
    output.error('Please provide a flag slug or ID to archive');
    output.log(`Example: ${getCommandName('flags archive my-feature')}`);
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

    if (flag.state === 'archived') {
      output.warn(`Flag ${chalk.bold(flag.slug)} is already archived`);
      return 0;
    }

    // Confirm archival
    if (!skipConfirmation) {
      const confirmed = await confirm({
        message: `Are you sure you want to archive ${chalk.bold(flag.slug)}?`,
        default: false,
      });

      if (!confirmed) {
        output.log('Aborted');
        return 0;
      }
    }

    // Archive the flag by setting state to 'archived'
    output.spinner('Archiving flag...');
    await updateFlag(client, project.id, flagArg, {
      state: 'archived',
      message: 'Archived via CLI',
    });
    output.stopSpinner();

    output.success(`Feature flag ${chalk.bold(flag.slug)} has been archived`);
    output.log(
      `\nTo restore this flag, visit the dashboard: ${chalk.cyan(`https://vercel.com/${link.org.slug}/${project.name}/flags`)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
