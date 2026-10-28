import type Client from '../../util/client';
import { parseArguments, takeCommand } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import { quoteArg } from '../../util/flags/quote-arg';
import { requireProjectContext } from '../../util/projects/require-project-context';
import {
  DEFAULT_SCHEDULE_NAMESPACE,
  SchedulesClient,
} from '../../util/schedules/client';
import { createLocalSchedulesClient } from '../../util/schedules/local-client';
import type { Schedule } from '../../util/schedules/types';
import output from '../../output-manager';
import { validateScheduleIdentifier } from './validation';
import { schedulesCommand, executionsListSubcommand } from './command';

const routingFlags = getFlagsSpecification([
  ...schedulesCommand.subcommands.flatMap(command => [...command.options]),
  ...executionsListSubcommand.options,
]);

// Remove only the command token, retaining flags, their values, and `--`.
export function takeScheduleCommand(argv: string[]) {
  return takeCommand(argv, routingFlags);
}

export function scheduleCommandWithGlobalFlags(
  client: Client,
  usage: string
): string {
  let local = false;
  try {
    local = !!parseArguments(client.argv.slice(2), routingFlags, {
      permissive: true,
    }).flags['--local'];
  } catch {
    // Invalid option values must not be reinterpreted as flags.
  }
  return buildCommandWithGlobalFlags(
    client.argv,
    `${usage}${local ? ' --local' : ''}`,
    undefined,
    {
      excludeFlags: local ? ['--scope', '--team'] : [],
    }
  );
}

export function validateLocalScheduleFlags(
  client: Client,
  flags: Record<string, unknown>,
  usage: string
): number | undefined {
  if (
    flags['--environment'] !== undefined &&
    flags['--git-branch'] !== undefined
  ) {
    return invalidScheduleArguments(
      client,
      usage,
      'Use either --environment or --git-branch, not both.'
    );
  }
  if (!flags['--local']) return;
  for (const flag of ['--environment', '--git-branch'] as const) {
    if (flags[flag] !== undefined) {
      return invalidScheduleArguments(
        client,
        usage,
        `Cannot combine --local with ${flag}. Local Schedules uses the current vercel dev session.`
      );
    }
  }
  let originalFlags;
  try {
    originalFlags = parseArguments(client.argv.slice(2), routingFlags, {
      permissive: true,
    }).flags;
  } catch (error) {
    return invalidScheduleArguments(
      client,
      usage,
      error instanceof Error ? error.message : String(error)
    );
  }
  for (const flag of ['--scope', '--team', '--token'] as const) {
    if (flags[flag] !== undefined || originalFlags[flag] !== undefined) {
      return invalidScheduleArguments(
        client,
        usage,
        `Cannot combine --local with ${flag}. Local Schedules uses the current vercel dev session.`
      );
    }
  }
}

export function unsupportedLocalExecutions(client: Client): number {
  const message =
    'Execution history is not supported for local Schedules. Inspect the vercel dev output for local executions.';
  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.API_ERROR,
      message,
      retryable: false,
    });
  } else {
    output.fatal(message);
  }
  return 1;
}

export async function resolveSchedulesClient(
  client: Client,
  flags: {
    '--local'?: boolean;
    '--environment'?: string;
    '--git-branch'?: string;
  }
): Promise<SchedulesClient | number> {
  if (flags['--local']) {
    try {
      const schedules = await createLocalSchedulesClient(client);
      output.log(`Using local Schedules at ${schedules.localOrigin}`);
      return schedules;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.API_ERROR,
          message,
          retryable: false,
        });
      } else {
        output.fatal(message);
      }
      return 1;
    }
  }
  const link = await requireProjectContext(client, 'schedules');
  if (typeof link === 'number') return link;
  return new SchedulesClient(client, {
    ownerId: link.org.id,
    projectId: link.project.id,
    environment: flags['--environment'],
    gitBranch: flags['--git-branch'],
  });
}

/**
 * The --environment or --git-branch arguments that selected the Track, for
 * commands printed to run next.
 */
export function scheduleTrackArgs(flags: {
  '--environment'?: string;
  '--git-branch'?: string;
}): string[] {
  const args: string[] = [];
  if (flags['--environment'] !== undefined) {
    args.push(`--environment ${quoteArg(flags['--environment'])}`);
  }
  if (flags['--git-branch'] !== undefined) {
    args.push(`--git-branch ${quoteArg(flags['--git-branch'])}`);
  }
  return args;
}

export function invalidScheduleArguments(
  client: Client,
  usage: string,
  message: string
): number {
  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [
        {
          command: scheduleCommandWithGlobalFlags(client, usage),
          when: 'Provide valid schedule arguments',
        },
      ],
    });
    return 2;
  }
  output.fatal(message);
  return 2;
}

export function validateScheduleNameAndNamespace(
  client: Client,
  args: string[],
  namespaceFlag: string | undefined,
  usage: string
):
  | { valid: true; name: string; namespace: string }
  | { valid: false; exitCode: number } {
  const [name] = args;
  if (!name) {
    return {
      valid: false,
      exitCode: invalidScheduleArguments(
        client,
        usage,
        'A schedule name is required'
      ),
    };
  }
  if (args.length !== 1) {
    return {
      valid: false,
      exitCode: invalidScheduleArguments(
        client,
        usage,
        `Expected one schedule name. Usage: ${getCommandName(usage)}`
      ),
    };
  }

  const namespace = namespaceFlag ?? DEFAULT_SCHEDULE_NAMESPACE;
  const nameError = validateScheduleIdentifier(name, 'Schedule name');
  const namespaceError = validateScheduleIdentifier(namespace, 'Namespace');
  const error = nameError ?? namespaceError;
  if (error) {
    return {
      valid: false,
      exitCode: invalidScheduleArguments(client, usage, error),
    };
  }
  return { valid: true, name, namespace };
}

export function parseScheduleOutput(
  client: Client,
  usage: string,
  flags: Record<string, string | boolean | number | undefined>
): { valid: true; json: boolean } | { valid: false; exitCode: number } {
  const result = validateJsonOutput(flags);
  return result.valid
    ? { valid: true, json: result.jsonOutput || client.nonInteractive }
    : {
        valid: false,
        exitCode: invalidScheduleArguments(client, usage, result.error),
      };
}

export function writeScheduleMutationResult(
  client: Client,
  schedule: Schedule,
  message: string,
  json: boolean
): number {
  if (json) {
    const value = client.nonInteractive
      ? { status: AGENT_STATUS.OK, schedule, message }
      : schedule;
    client.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else {
    output.success(message);
  }
  return 0;
}
