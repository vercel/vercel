import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { AGENT_REASON } from '../../util/agent-output-constants';
import sleep from '../../util/sleep';
import output from '../../output-manager';
import {
  getCiInvocationTree,
  getCiSetupLogs,
  getCiTaskLogs,
  getCiTaskRunLogs,
  streamCiTaskRunLogs,
  type CiTaskLogs,
  type CiTaskRunLocator,
} from '../../util/ci/api';
import { toDisplayRunId } from '../../util/ci/ids';
import { ciDisplayText } from '../../util/ci/output';
import type { CiLogLine } from '../../util/ci/types';
import {
  CiLogReplay,
  CiReplayLimitError,
  CiStreamOutputError,
  reportCiStreamError,
  writeCiOutput,
} from '../../util/ci/streaming';
import { CiLogsTelemetryClient } from '../../util/telemetry/commands/ci/logs';
import { CI_LOG_LEVELS, logsSubcommand } from './command';
import { failCi, handleCiApiError, invalidCiArguments } from './errors';
import { resolveAttemptNumber, resolveRunTarget } from './resolve-run';

const MAX_TASK_LIMIT = 25;
const MAX_GREP_LENGTH = 256;
const EOF_LEVEL = 'eof';
const MAX_STREAM_FAILURES = 3;
const STREAM_RETRY_DELAY_MS = 2000;

export default async function logs(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CiLogsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(logsSubcommand.options)
    );
  } catch (error) {
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;

  telemetry.trackCliArgumentRun(args[0]);
  telemetry.trackCliFlagFailed(flags['--failed']);
  telemetry.trackCliOptionTask(flags['--task']);
  telemetry.trackCliOptionLevel(flags['--level']);
  telemetry.trackCliOptionGrep(flags['--grep']);
  telemetry.trackCliOptionAttempt(flags['--attempt']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliFlagFollow(flags['--follow']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (args.length > 1) {
    return invalidCiArguments(
      client,
      `Pass at most 1 run ID. Usage: ${getCommandName('ci logs [run]')}`
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidCiArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const levels = flags['--level'] ?? [];
  const unknownLevel = levels.find(
    level => !(CI_LOG_LEVELS as readonly string[]).includes(level)
  );
  if (unknownLevel !== undefined) {
    return invalidCiArguments(
      client,
      `Level must be one of: ${CI_LOG_LEVELS.join(', ')}.`
    );
  }

  const attempt = flags['--attempt'];
  if (attempt !== undefined && (!Number.isInteger(attempt) || attempt < 1)) {
    return invalidCiArguments(
      client,
      '--attempt must be a whole number of 1 or more.'
    );
  }

  const limit = flags['--limit'];
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > MAX_TASK_LIMIT)
  ) {
    return invalidCiArguments(
      client,
      `--limit must be a whole number from 1 to ${MAX_TASK_LIMIT}.`
    );
  }

  const grep = flags['--grep'];
  if (grep !== undefined) {
    if (grep.trim() === '' || grep.length > MAX_GREP_LENGTH) {
      return invalidCiArguments(
        client,
        `--grep takes 1 to ${MAX_GREP_LENGTH} characters of text.`
      );
    }
    if (flags['--follow']) {
      return invalidCiArguments(
        client,
        "--grep can't be combined with --follow. Use --level to filter a stream."
      );
    }
    if (limit !== undefined) {
      return invalidCiArguments(
        client,
        '--grep searches every task, so --limit does not apply. Narrow with --task or --failed.'
      );
    }
  }

  if (flags['--failed'] && flags['--follow']) {
    return invalidCiArguments(
      client,
      "--failed can't be combined with --follow. Fetch failed task logs without --follow."
    );
  }

  const tasks = flags['--task'] ?? [];
  if (flags['--follow'] && tasks.length !== 1) {
    return invalidCiArguments(
      client,
      '--follow streams 1 task at a time. Pass --task <name>.'
    );
  }

  const target = await resolveRunTarget(client, args[0], attempt);
  if (typeof target === 'number') {
    return target;
  }

  let attemptNumber: number;
  try {
    attemptNumber = await resolveAttemptNumber(client, target);
  } catch (err) {
    return handleCiApiError(client, 'fetch the Vercel CI run', err);
  }

  if (flags['--follow']) {
    return followTask(client, {
      invocationId: target.invocationId,
      attempt: attemptNumber,
      accountId: target.accountId,
      taskName: tasks[0],
      levels,
      asJson,
    });
  }

  let result: CiTaskLogs;
  let setup: { failed: boolean; lines: CiLogLine[] } | undefined;
  let runFinished: boolean | undefined;
  try {
    if (!asJson) {
      output.spinner('Fetching task logs…');
    }
    result = await getCiTaskLogs(
      client,
      target.invocationId,
      attemptNumber,
      {
        tasks,
        conclusions: flags['--failed'] ? ['failed'] : undefined,
        levels,
        search: grep,
        limit,
      },
      target.accountId
    );
    if (flags['--failed'] && result.tasks.length === 0) {
      if (tasks.length === 0) {
        setup = await getCiSetupLogs(
          client,
          target.invocationId,
          attemptNumber,
          {
            levels,
            accountId: target.accountId,
          }
        );
      }
      if (!setup?.failed) {
        const tree = await getCiInvocationTree(client, target.invocationId, {
          attempt: attemptNumber,
          accountId: target.accountId,
        });
        runFinished = Boolean(
          tree.invocation.completed || tree.invocation.skipped
        );
      }
    }
  } catch (err) {
    output.stopSpinner();
    return handleCiApiError(client, 'fetch task logs', err);
  }
  output.stopSpinner();

  const runId = toDisplayRunId(target.invocationId);
  const view = {
    run: {
      id: runId,
      attempt: attemptNumber,
      ...(runFinished !== undefined ? { finished: runFinished } : {}),
    },
    tasks: result.tasks.map(task => ({
      job: task.jobName,
      name: task.taskName,
      status: task.conclusion?.result ?? 'running',
      ...(task.conclusion && 'reason' in task.conclusion
        ? { reason: task.conclusion.reason }
        : {}),
      lines: task.lines.filter(isContentLine).map(toJsonLine),
    })),
    hasMore: result.hasMore,
    ...(setup?.failed
      ? {
          setup: {
            status: 'failed' as const,
            lines: setup.lines
              .filter(isContentLine)
              .filter(line => grep === undefined || matchesGrep(line, grep))
              .map(toJsonLine),
          },
        }
      : {}),
  };

  if (asJson) {
    await writeCiOutput(client.stdout, `${JSON.stringify(view, null, 2)}\n`);
    return 0;
  }

  if (view.setup) {
    output.log(`${chalk.bold('Setup')} ${chalk.gray('·')} failed`);
    if (view.setup.lines.length === 0) {
      output.print(
        chalk.gray(
          grep === undefined
            ? '  No log lines.\n'
            : `  No setup log lines match "${ciDisplayText(grep)}".\n`
        )
      );
    }
    for (const line of view.setup.lines) {
      await writeCiOutput(
        client.stdout,
        `${grep === undefined ? ciDisplayText(line.message) : highlightGrep(line.message, grep)}\n`
      );
    }
    return 0;
  }

  if (grep !== undefined) {
    return printGrepMatches(client, view, grep);
  }

  if (view.tasks.length === 0) {
    output.log(
      flags['--failed'] && tasks.length === 0
        ? runFinished
          ? 'No failed tasks in this run.'
          : 'No failed tasks yet. The run is still in progress.'
        : 'No tasks match the current filters.'
    );
    return 0;
  }

  for (const task of view.tasks) {
    const reason = task.reason
      ? ` ${chalk.gray('·')} ${ciDisplayText(task.reason)}`
      : '';
    output.log(
      `${chalk.bold(ciDisplayText(task.name))} ${chalk.gray('·')} ${ciDisplayText(task.status)}${reason}`
    );
    if (task.lines.length === 0) {
      output.print(chalk.gray('  No log lines.\n'));
    }
    for (const line of task.lines) {
      await writeCiOutput(client.stdout, `${ciDisplayText(line.message)}\n`);
    }
  }

  if (view.hasMore) {
    output.log(
      `Showing ${plural('task', view.tasks.length, true)}. More tasks match; narrow with --task or raise --limit (max ${MAX_TASK_LIMIT}).`
    );
  }

  return 0;
}

async function printGrepMatches(
  client: Client,
  view: {
    tasks: Array<{ name: string; lines: Array<{ message: string }> }>;
    hasMore: boolean;
  },
  grep: string
): Promise<number> {
  const matching = view.tasks
    .filter(task => task.lines.length > 0)
    .map(task => ({ ...task, name: ciDisplayText(task.name) }));
  if (matching.length === 0) {
    output.log(`No log lines match "${ciDisplayText(grep)}".`);
    return 0;
  }

  const width = Math.max(...matching.map(task => task.name.length));
  let lineCount = 0;
  for (const task of matching) {
    for (const line of task.lines) {
      lineCount++;
      await writeCiOutput(
        client.stdout,
        `${chalk.cyan(task.name.padEnd(width))}  ${highlightGrep(line.message, grep)}\n`
      );
    }
  }

  output.log(
    `${plural('matching line', lineCount, true)} in ${plural('task', matching.length, true)}`
  );
  if (view.hasMore) {
    output.log(
      `Showing the first ${lineCount} matching lines. Narrow with --task, --failed, or --level.`
    );
  }
  return 0;
}

function matchesGrep(line: CiLogLine, grep: string): boolean {
  return line.message.toLowerCase().includes(grep.toLowerCase());
}

function highlightGrep(message: string, grep: string): string {
  message = ciDisplayText(message);
  const needle = ciDisplayText(grep);
  if (needle.length === 0) return message;
  const literal = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return message.replace(new RegExp(literal, 'giu'), match =>
    chalk.red.bold(match)
  );
}

async function followTask(
  client: Client,
  options: {
    invocationId: string;
    attempt: number;
    accountId?: string;
    taskName: string;
    levels: readonly string[];
    asJson: boolean;
  }
): Promise<number> {
  let replay = new CiLogReplay();
  const report = (callback: (client: Client) => number) =>
    reportCiStreamError(client, options.asJson, callback);
  let previousLocator: string | undefined;
  let completingLocator: CiTaskRunLocator | undefined;
  let sawContent = false;
  let failures = 0;
  let announced = false;

  while (true) {
    let locator: CiTaskRunLocator;
    let finished: boolean;
    try {
      if (completingLocator) {
        // Drain the same attempt after a failed final read, even if a newer
        // task attempt has appeared in the tree in the meantime.
        locator = completingLocator;
        finished = true;
      } else {
        const resolved = await findTask(client, options, report);
        if (typeof resolved === 'number') {
          return resolved;
        }
        ({ locator, finished } = resolved);
      }
    } catch (err) {
      if (err instanceof CiStreamOutputError) throw err;
      return report(reportingClient =>
        isAPIError(err)
          ? handleCiApiError(reportingClient, 'fetch the Vercel CI run', err)
          : failCi(reportingClient, {
              reason: AGENT_REASON.API_ERROR,
              message:
                'Failed to fetch a valid Vercel CI run tree. Fetch task logs without --follow.',
            })
      );
    }

    const locatorKey = JSON.stringify(locator);
    if (locatorKey !== previousLocator) {
      replay = new CiLogReplay();
      sawContent = false;
      completingLocator = undefined;
      failures = 0;
      previousLocator = locatorKey;
    }

    if (!options.asJson && !announced) {
      output.log(
        `Streaming logs for ${chalk.bold(ciDisplayText(options.taskName))}. Press Ctrl+C to stop; the run keeps going.`
      );
      announced = true;
    }

    let sawEof = false;
    const printLines = async (lines: unknown, accept = replay.begin()) => {
      if (!Array.isArray(lines) || !lines.every(isLogEvent)) {
        throw new Error('Invalid Vercel CI log event.');
      }
      for (const line of lines) {
        if (!isContentLine(line)) {
          sawEof = true;
          continue;
        }
        sawContent = true;
        if (!accept(line)) continue;
        await writeCiOutput(
          client.stdout,
          options.asJson
            ? `${JSON.stringify(toJsonLine(line))}\n`
            : `${ciDisplayText(line.message)}\n`
        );
      }
    };
    try {
      if (!finished) {
        // One replay cursor per HTTP response preserves identical-line counts.
        const accept = replay.begin();
        for await (const event of streamCiTaskRunLogs(client, locator, {
          // Deliberately omit since: timestamp order is not ingestion order.
          levels: options.levels,
          accountId: options.accountId,
        })) {
          const value: unknown = event;
          const lines =
            typeof value === 'object' && value !== null && 'lines' in value
              ? (value as { lines: unknown }).lines
              : [value];
          await printLines(lines, accept);
          // Close the stream promptly, then replay a full snapshot. A follow
          // response can omit late records even when it signals completion.
          if (sawEof) break;
        }
      }
      if (finished || sawEof) {
        completingLocator = locator;
        const snapshot = await getCiTaskRunLogs(client, locator, {
          levels: options.levels,
          accountId: options.accountId,
        });
        await printLines(snapshot?.lines);
        if (
          locator.taskRunAttempt > 1 &&
          !sawContent &&
          !options.levels.length
        ) {
          // Empty output is valid for quiet, cached, or skipped tasks. Warn
          // about the retry endpoint's possible limitation without claiming an
          // API failure or putting diagnostics among stdout log records.
          const message = `No logs were returned for task attempt ${locator.taskRunAttempt}. Logs may be empty or unavailable for this attempt. Fetch task logs without --follow.`;
          if (options.asJson) {
            await writeCiOutput(
              client.stderr,
              `${JSON.stringify({ type: 'warning', reason: 'ci_logs_empty', message })}\n`
            );
          } else {
            output.print(`! ${message}\n`);
          }
        }
        return 0;
      }
      // The server closes healthy streams at its duration limit without EOF.
      // Reconnect after a delay, including quiet tasks; only interrupted or
      // invalid responses count toward the consecutive-failure limit.
      failures = 0;
    } catch (err) {
      // Output failures are local: reconnecting would consume/drop more logs.
      if (err instanceof CiStreamOutputError) throw err;
      if (err instanceof CiReplayLimitError) {
        return report(reportingClient =>
          failCi(reportingClient, {
            reason: AGENT_REASON.API_ERROR,
            message: err.message,
          })
        );
      }
      if (isAPIError(err)) {
        return report(reportingClient =>
          handleCiApiError(reportingClient, 'stream task logs', err)
        );
      }
      // Partial valid records do not reset failures in an interrupted or
      // invalid response. A failed final snapshot is retried as a snapshot.
      if (++failures >= MAX_STREAM_FAILURES) {
        return report(reportingClient =>
          failCi(reportingClient, {
            reason: AGENT_REASON.API_ERROR,
            message: `Failed to stream task logs after ${MAX_STREAM_FAILURES} interrupted or invalid responses. The run may still be running; check it with ${getCommandName(`ci inspect ${toDisplayRunId(options.invocationId)}`)}.`,
          })
        );
      }
      output.debug(
        `Vercel CI log stream interrupted: ${ciDisplayText(String(err))}`
      );
    }
    await sleep(STREAM_RETRY_DELAY_MS);
  }
}

async function findTask(
  client: Client,
  options: {
    invocationId: string;
    attempt: number;
    accountId?: string;
    taskName: string;
  },
  report: (callback: (client: Client) => number) => Promise<number>
): Promise<{ locator: CiTaskRunLocator; finished: boolean } | number> {
  const tree = await getCiInvocationTree(client, options.invocationId, {
    attempt: options.attempt,
    accountId: options.accountId,
  });
  const matches = tree.jobs.flatMap(job =>
    job.tasks
      .filter(task => task.definition.name === options.taskName)
      .map(task => ({ job, task }))
  );

  if (matches.length !== 1) {
    return report(reportingClient =>
      failCi(reportingClient, {
        reason:
          matches.length === 0
            ? AGENT_REASON.NOT_FOUND
            : AGENT_REASON.INVALID_ARGUMENTS,
        message:
          matches.length === 0
            ? `Couldn't find a task with that name in this run. List tasks with ${getCommandName(`ci inspect ${toDisplayRunId(options.invocationId)}`)}.`
            : `${matches.length} jobs have a task with that name. Streaming needs a unique task name.`,
      })
    );
  }

  const [{ job, task }] = matches;
  return {
    locator: {
      invocationId: options.invocationId,
      attempt: options.attempt,
      jobDefinitionId: job.definition.jobDefinitionId,
      jobRunAttempt: task.definition.jobRunAttempt,
      taskDefinitionId: task.definition.taskDefinitionId,
      taskRunAttempt: task.run?.attempt ?? 1,
    },
    finished: Boolean(task.run?.completed),
  };
}

function isLogEvent(value: unknown): value is CiLogLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Partial<CiLogLine>;
  return (
    typeof line.message === 'string' &&
    typeof line.level === 'string' &&
    (line.level === EOF_LEVEL ||
      (CI_LOG_LEVELS as readonly string[]).includes(line.level)) &&
    typeof line.timestamp === 'number' &&
    Number.isFinite(line.timestamp) &&
    !Number.isNaN(new Date(line.timestamp).getTime())
  );
}

function isContentLine(line: CiLogLine): boolean {
  return line.level !== EOF_LEVEL;
}

function toJsonLine(line: CiLogLine) {
  return {
    timestamp: new Date(line.timestamp).toISOString(),
    level: line.level,
    message: line.message,
  };
}
