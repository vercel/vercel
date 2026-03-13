import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import {
  buildCommandWithGlobalFlags,
  buildCommandWithYes,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import { getFlagsDashboardUrl } from '../../util/flags/dashboard-url';
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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: 'Please provide a flag slug or ID to archive.',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'flags archive <flag> --yes'
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error('Please provide a flag slug or ID to archive');
    output.log(`Example: ${getCommandName('flags archive my-feature')}`);
    return 1;
  }

  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message: 'Archiving a flag requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliFlagYes(skipConfirmation);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          message: 'Your codebase is not linked to a project. Run link first.',
          next: [
            {
              command: buildCommandWithGlobalFlags(client.argv, 'link'),
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    if (!client.nonInteractive) {
      output.spinner('Fetching flag...');
    }
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      if (client.nonInteractive) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: 'ok',
              flag: { slug: flag.slug },
              message: 'Flag is already archived.',
            },
            null,
            2
          )}\n`
        );
        return 0;
      }
      output.warn(`Flag ${chalk.bold(flag.slug)} is already archived`);
      return 0;
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
        if (!client.nonInteractive) output.log('Aborted');
        return 0;
      }
    }

    if (!client.nonInteractive) {
      output.spinner('Archiving flag...');
    }
    await updateFlag(client, project.id, flagArg, {
      state: 'archived',
      message: 'Archived via CLI',
    });
    output.stopSpinner();

    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'ok',
            flag: { slug: flag.slug },
            message: `Feature flag ${flag.slug} has been archived.`,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `flags rm ${flag.slug} --yes`
                ),
                when: 'Delete the archived flag',
              },
            ],
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.success(`Feature flag ${chalk.bold(flag.slug)} has been archived`);
    output.log(
      `\nTo restore this flag, visit the dashboard: ${chalk.cyan(getFlagsDashboardUrl(link.org.slug, project.name) + '/archive')}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
