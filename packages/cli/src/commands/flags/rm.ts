import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_flag',
          message: 'Please provide a flag slug or ID to delete.',
          next: [{ command: getCommandName('flags rm <flag> --yes') }],
        },
        1
      );
    }
    output.error('Please provide a flag slug or ID to delete');
    output.log(`Example: ${getCommandName('flags rm my-feature')}`);
    return 1;
  }

  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message: 'Deleting a flag requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
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
          status: 'error',
          reason: 'not_linked',
          message: 'Your codebase is not linked to a project. Run link first.',
          next: [{ command: getCommandName('link') }],
        },
        1
      );
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

    // Flag must be archived before it can be deleted
    if (flag.state !== 'archived') {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'flag_not_archived',
            message: `Flag ${flag.slug} must be archived before it can be deleted.`,
            next: [
              { command: getCommandName(`flags archive ${flag.slug} --yes`) },
            ],
          },
          1
        );
      }
      output.error(
        `Flag ${chalk.bold(flag.slug)} must be archived before it can be deleted. Run ${getCommandName(`flags archive ${flag.slug}`)} first.`
      );
      return 1;
    }

    // Confirm deletion
    if (!skipConfirmation) {
      const confirmed = await client.input.confirm(
        `Are you sure you want to delete ${chalk.bold(flag.slug)}? This action cannot be undone.`,
        false
      );

      if (!confirmed) {
        if (!client.nonInteractive) output.log('Aborted');
        return 0;
      }
    }

    if (!client.nonInteractive) {
      output.spinner('Deleting flag...');
    }
    await deleteFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'ok',
            flag: { slug: flag.slug },
            message: `Feature flag ${flag.slug} has been deleted.`,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.success(`Feature flag ${chalk.bold(flag.slug)} has been deleted`);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
