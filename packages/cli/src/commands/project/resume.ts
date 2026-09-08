import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import output from '../../output-manager';
import stamp from '../../util/output/stamp';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import {
  isAPIError,
  ProjectNotFound,
  LinkRequiredError,
} from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectResumeTelemetryClient } from '../../util/telemetry/commands/project/resume';
import { resumeSubcommand } from './command';
import {
  outputActionRequired,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { canPrompt } from '../../util/can-prompt';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

export default async function resume(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectResumeTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(resumeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: error instanceof Error ? error.message : String(error),
    });
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
    });
    output.error(formatResult.error);
    return 1;
  }

  const { jsonOutput } = formatResult;
  const asJson = jsonOutput || !canPrompt(client);

  function fail(
    reason: string,
    message: string,
    humanMessage: string = message,
    exitCode = 1
  ): number {
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason,
          message,
        },
        exitCode
      );
      return exitCode;
    }
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          { status: AGENT_STATUS.ERROR, reason, message },
          null,
          2
        )}\n`
      );
      return exitCode;
    }
    output.error(humanMessage);
    return exitCode;
  }

  if (args.length > 1) {
    return fail(
      AGENT_REASON.MISSING_ARGUMENTS,
      `Invalid number of arguments. Usage: ${getCommandName(
        'project resume [project]'
      )}`,
      `Invalid number of arguments. Usage: ${chalk.cyan(
        getCommandName('project resume [project]')
      )}`,
      2
    );
  }

  telemetry.trackCliArgumentProject(args[0]);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      flag => flag !== '--non-interactive'
    );
    const interactiveCommand = getCommandNamePlain(
      `project resume ${args[0] ? `${args[0]} ` : ''}${globalFlags.join(' ')}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          'Resuming a project restores production traffic. ' +
          'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.',
        userActionRequired: true,
        hint: 'Surface this to the user; the confirmation cannot be automated.',
        next: [
          {
            command: interactiveCommand,
            when: 'user runs this command in an interactive terminal',
          },
        ],
      },
      1
    );
    output.error(
      'This command must be run interactively because it resumes production traffic.'
    );
    return 1;
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project resume',
      projectNameOrId: args[0],
      forReadOnlyCommand: true,
    });
  } catch (error) {
    return fail(
      error instanceof ProjectNotFound
        ? AGENT_REASON.PROJECT_NOT_FOUND
        : error instanceof LinkRequiredError
          ? AGENT_REASON.NOT_LINKED
          : AGENT_REASON.API_ERROR,
      error instanceof Error ? error.message : String(error)
    );
  }

  const confirmed = await client.input.confirm(
    `Resume production traffic for ${project.name}?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const resumeStamp = stamp();
  try {
    await client.fetch(
      `/v1/projects/${encodeURIComponent(project.id)}/unpause`,
      {
        method: 'POST',
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 404) {
        return fail(AGENT_REASON.NOT_FOUND, 'Project not found.');
      }
      if (err.status === 403) {
        return fail(
          'forbidden',
          err.serverMessage ||
            'You do not have permission to resume this project.'
        );
      }
    }
    return fail(
      AGENT_REASON.API_ERROR,
      err instanceof Error ? err.message : String(err)
    );
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        { id: project.id, name: project.name, paused: false },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `Production traffic for ${chalk.bold(project.name)} resumed ${chalk.gray(
      resumeStamp()
    )}`
  );
  return 0;
}
