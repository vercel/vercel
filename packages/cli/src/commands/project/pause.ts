import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import output from '../../output-manager';
import stamp from '../../util/output/stamp';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectPauseTelemetryClient } from '../../util/telemetry/commands/project/pause';
import { pauseSubcommand } from './command';
import {
  buildCommandWithYes,
  exitWithNonInteractiveError,
  outputActionRequired,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

export default async function pause(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectPauseTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(pauseSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        getCommandName('project pause [project]')
      )}`
    );
    return 2;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliArgumentProject(args[0]);
  telemetry.trackCliFlagYes(flags['--yes']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project pause',
      projectNameOrId: args[0],
      forReadOnlyCommand: true,
    });
  } catch (error) {
    exitWithNonInteractiveError(client, error, 1, { variant: 'pause' });
    printError(error);
    return 1;
  }

  const skipConfirmation = flags['--yes'];

  if (client.nonInteractive && !skipConfirmation) {
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          'In non-interactive mode --yes is required to pause a project.',
        next: [
          {
            command: buildCommandWithYes(client.argv),
            when: 'to confirm pausing production traffic',
          },
        ],
      },
      1
    );
    return 1;
  }

  const confirmed =
    skipConfirmation ||
    (await client.input.confirm(
      `Pausing ${chalk.bold(project.name)} will stop serving production traffic and visitors will see an error page. Continue?`,
      false
    ));
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const pauseStamp = stamp();
  try {
    await client.fetch(`/v1/projects/${encodeURIComponent(project.id)}/pause`, {
      method: 'POST',
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'pause' });
    if (isAPIError(err)) {
      if (err.status === 404) {
        output.error(`Project not found.`);
        return 1;
      }
      if (err.status === 403) {
        output.error(
          err.serverMessage ||
            'You do not have permission to pause this project.'
        );
        return 1;
      }
    }
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        { id: project.id, name: project.name, paused: true },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `Production traffic for ${chalk.bold(project.name)} paused ${chalk.gray(
      pauseStamp()
    )}`
  );
  return 0;
}
