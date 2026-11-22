import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { countFlagEvaluations } from '../../util/flags/flag-evaluations';
import { getFlag } from '../../util/flags/get-flags';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import { quoteArg } from '../../util/flags/quote-arg';
import { updateFlag } from '../../util/flags/update-flag';
import output from '../../output-manager';
import { FlagsArchiveTelemetryClient } from '../../util/telemetry/commands/flags/archive';
import { archiveSubcommand } from './command';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

const EVALUATION_WINDOW_DAYS = 3;

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
    return 2;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const skipConfirmation = flags['--yes'] as boolean | undefined;
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );
  const projectName = getProjectNameFromFlags(flags);

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to archive');
    output.log(`Example: ${getCommandName('flags archive my-feature')}`);
    return 2;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliFlagYes(skipConfirmation);
  telemetryClient.trackCliOptionMessage(message);

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

  const { project, org } = link;

  try {
    // First, verify the flag exists
    output.spinner('Fetching flag...');
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.warn(`Flag ${chalk.bold(flag.slug)} is already archived`);
      return 0;
    }

    if (!skipConfirmation && !client.stdin.isTTY) {
      output.error(
        'Missing required option --yes. Use --yes to skip the confirmation prompt in non-interactive mode.'
      );
      return 2;
    }

    output.spinner('Checking recent evaluations...');
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - EVALUATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const evaluations = await countFlagEvaluations(client, {
      ownerId: org.id,
      projectId: project.id,
      flagSlug: flag.slug,
      startTime,
      endTime,
    });
    output.stopSpinner();

    const window = `the last ${EVALUATION_WINDOW_DAYS} days`;
    if (evaluations === null) {
      const evaluationsCommand = [
        'flags',
        'evaluations',
        flag.slug,
        '--since',
        `${EVALUATION_WINDOW_DAYS}d`,
        ...getGlobalFlagsFromArgs(client.argv.slice(2), {
          preserveProject: true,
        }),
      ]
        .map(quoteArg)
        .join(' ');
      output.log(
        `Could not check recent evaluations for ${chalk.bold(flag.slug)}. Run ${getCommandName(evaluationsCommand)} to verify the flag is no longer evaluated.`
      );
    } else if (evaluations > 0) {
      output.warn(
        `${chalk.bold(flag.slug)} reported ${evaluations.toLocaleString()} ${evaluations === 1 ? 'evaluation' : 'evaluations'} in ${window}. Archived flags evaluate to the default value in code. Remove the flag from your code and deploy before archiving.`
      );
    } else {
      output.log(
        `No evaluations reported for ${chalk.bold(flag.slug)} in ${window}.`
      );
    }

    // Confirm archival
    if (!skipConfirmation) {
      const confirmed = await client.input.confirm(
        evaluations !== null && evaluations > 0
          ? `Archive ${chalk.bold(flag.slug)} anyway?`
          : `Are you sure you want to archive ${chalk.bold(flag.slug)}?`,
        false
      );

      if (!confirmed) {
        output.log('Aborted');
        return 0;
      }
    }

    // Archive the flag by setting state to 'archived'
    output.spinner('Archiving flag...');
    await updateFlag(client, project.id, flagArg, {
      state: 'archived',
      message: message ?? 'Archived via CLI',
    });
    output.stopSpinner();

    output.success(`Feature flag ${chalk.bold(flag.slug)} has been archived`);
    output.log(
      `\nTo unarchive this flag, run ${getCommandName(`flags unarchive ${flag.slug}`)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
