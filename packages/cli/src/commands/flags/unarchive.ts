import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import output from '../../output-manager';
import { FlagsUnarchiveTelemetryClient } from '../../util/telemetry/commands/flags/unarchive';
import { unarchiveSubcommand } from './command';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

export default async function unarchive(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsUnarchiveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(unarchiveSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const skipConfirmation = flags['--yes'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to unarchive');
    output.log(`Example: ${getCommandName('flags unarchive my-feature')}`);
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliFlagYes(skipConfirmation);

  const link = await getLinkedFlagsProject(client, projectName);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run ${getCommandName('link')} to link it.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    output.spinner('Fetching flag...');
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'active') {
      output.warn(`Flag ${chalk.bold(flag.slug)} is already active`);
      return 0;
    }

    if (!skipConfirmation) {
      if (!client.stdin.isTTY) {
        output.error(
          'Missing required flag --yes. Use --yes to skip the confirmation prompt in non-interactive mode.'
        );
        return 1;
      }

      const confirmed = await client.input.confirm(
        `Are you sure you want to unarchive ${chalk.bold(flag.slug)}?`,
        false
      );

      if (!confirmed) {
        output.log('Aborted');
        return 0;
      }
    }

    output.spinner('Unarchiving flag...');
    await updateFlag(client, project.id, flagArg, {
      state: 'active',
      message: 'Unarchive',
    });
    output.stopSpinner();

    output.success(`Feature flag ${chalk.bold(flag.slug)} has been unarchived`);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
