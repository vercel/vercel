import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import output from '../../output-manager';
import { FlagsArchiveTelemetryClient } from '../../util/telemetry/commands/flags/archive';
import { archiveSubcommand } from './command';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';
import {
  buildFlagSafetyRetryCommand,
  formatFlagSafetyFailure,
  getFlagSafetyBlockers,
} from '../../util/flags/safety-check';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_STATUS } from '../../util/agent-output-constants';

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
  const dangerouslyForce = flags['--dangerously-force'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to archive');
    output.log(`Example: ${getCommandName('flags archive my-feature')}`);
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliFlagYes(skipConfirmation);
  telemetryClient.trackCliFlagDangerouslyForce(dangerouslyForce);

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
    // First, verify the flag exists
    output.spinner('Fetching flag...');
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.warn(`Flag ${chalk.bold(flag.slug)} is already archived`);
      return 0;
    }

    let blockers = await getFlagSafetyBlockers({
      client,
      projectId: project.id,
      ownerId: link.org.id,
      slug: flag.slug,
    });

    if (blockers.length && !dangerouslyForce) {
      const retryCmd = buildFlagSafetyRetryCommand({
        client,
        operation: 'archive',
        slug: flag.slug,
        includeYes: Boolean(skipConfirmation || client.nonInteractive),
      });

      const errorMessage = formatFlagSafetyFailure({
        flagName: chalk.bold(flag.slug),
        operation: 'archive',
        blockers,
        retryCommand: retryCmd,
      });

      if (client.nonInteractive) {
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: 'production_safety_check_failed',
          message: stripAnsi(errorMessage),
          next: [
            {
              command: retryCmd,
              when: 'override the production safety check',
            },
          ],
        });
        return 1;
      }

      output.error(errorMessage);
      return 1;
    }

    // Confirm archival
    if (!skipConfirmation) {
      if (!client.stdin.isTTY) {
        output.error(
          'Missing required flag --yes. Use --yes to skip the confirmation prompt in non-interactive mode.'
        );
        return 1;
      }

      const confirmed = await client.input.confirm(
        `Are you sure you want to archive ${chalk.bold(flag.slug)}?`,
        false
      );

      if (!confirmed) {
        output.log('Aborted');
        return 0;
      }

      // Recheck safety after interactive confirmation to catch race conditions
      blockers = await getFlagSafetyBlockers({
        client,
        projectId: project.id,
        ownerId: link.org.id,
        slug: flag.slug,
      });

      if (blockers.length && !dangerouslyForce) {
        const retryCmd = buildFlagSafetyRetryCommand({
          client,
          operation: 'archive',
          slug: flag.slug,
          includeYes: false,
        });

        output.error(
          formatFlagSafetyFailure({
            flagName: chalk.bold(flag.slug),
            operation: 'archive',
            blockers,
            retryCommand: retryCmd,
            detectedAfterConfirmation: true,
          })
        );
        return 1;
      }
    }

    if (blockers.length) {
      output.warn(
        `Archiving ${chalk.bold(flag.slug)} despite production activity because --dangerously-force was provided.`
      );
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
      `\nTo unarchive this flag, run ${getCommandName(`flags unarchive ${flag.slug}`)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
