import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import { applyDeprecatedGitBranchFlag } from '../../util/git-branch-option';
import output from '../../output-manager';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import {
  getCiInvocationTree,
  getLatestCiAttempt,
  listCiInvocations,
  searchCiLogs,
  type CiLogSearch,
  type CiTaskLogs,
} from '../../util/ci/api';
import {
  CI_RUN_STATUSES,
  getRunStatus,
  toShortSha,
  type CiRunStatus,
} from '../../util/ci/run-status';
import {
  toRunSummary,
  type CiRunSummary,
  type CiStepStatus,
} from '../../util/ci/run-view';
import { isAPIError } from '../../util/errors-ts';
import { toApiRunId } from '../../util/ci/ids';
import { buildCiCommand, ciDisplayText } from '../../util/ci/output';
import type { CiInvocation, CiInvocationTree } from '../../util/ci/types';
import { CiGrepTelemetryClient } from '../../util/telemetry/commands/ci/grep';
import { CI_LOG_LEVELS, grepSubcommand } from './command';
import { resolveCiContext } from './context';
import { failCi, handleCiApiError, invalidCiArguments } from './errors';
import { formatStatus } from './render';

const DEFAULT_RUNS = 20;
const MAX_RUNS = 50;
const MAX_SCAN_PAGES = 100;
// Each distinct candidate needs an attempts request and a tree request.
const MAX_SCAN_CANDIDATES = 100;
const MAX_TEXT_LENGTH = 256;
const EOF_LEVEL = 'eof';

export default async function grep(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CiGrepTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(grepSubcommand.options)
    );
  } catch (error) {
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;

  telemetry.trackCliArgumentText(args[0]);
  telemetry.trackCliOptionGitBranch(flags['--git-branch']);
  telemetry.trackCliOptionBranch(flags['--branch']);
  telemetry.trackCliFlagAllBranches(flags['--all-branches']);
  telemetry.trackCliOptionStatus(flags['--status']);
  telemetry.trackCliOptionRuns(flags['--runs']);
  telemetry.trackCliOptionLevel(flags['--level']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const text = args[0];
  if (args.length !== 1 || !text || text.trim() === '') {
    return invalidCiArguments(
      client,
      `Pass the text to search for. Usage: ${getCommandName('ci grep <text>')}`
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return invalidCiArguments(
      client,
      `Search text can be at most ${MAX_TEXT_LENGTH} characters.`
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidCiArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const branchError = applyDeprecatedGitBranchFlag(client, flags, '--branch');
  if (branchError) {
    return invalidCiArguments(client, branchError);
  }

  if (flags['--git-branch'] && flags['--all-branches']) {
    return invalidCiArguments(
      client,
      "Can't combine --git-branch with --all-branches. Pass one of them."
    );
  }

  const status = flags['--status'];
  if (
    status !== undefined &&
    !CI_RUN_STATUSES.includes(status as CiRunStatus)
  ) {
    return invalidCiArguments(
      client,
      `Status must be one of: ${CI_RUN_STATUSES.join(', ')}.`
    );
  }

  const runCount = flags['--runs'] ?? DEFAULT_RUNS;
  if (!Number.isInteger(runCount) || runCount < 1 || runCount > MAX_RUNS) {
    return invalidCiArguments(
      client,
      `--runs must be a whole number from 1 to ${MAX_RUNS}.`
    );
  }

  const levels = flags['--level'] ?? [];
  if (
    levels.some(level => !(CI_LOG_LEVELS as readonly string[]).includes(level))
  ) {
    return invalidCiArguments(
      client,
      `Level must be one of: ${CI_LOG_LEVELS.join(', ')}.`
    );
  }

  const context = await resolveCiContext(client);
  if (typeof context === 'number') {
    return context;
  }
  const { git, accountId } = context;
  const branch = flags['--all-branches']
    ? undefined
    : (flags['--git-branch'] ?? git.branch);

  const selected = new Map<string, CiInvocation>();
  const trees = new Map<string, CiInvocationTree>();
  const seen = new Set<string>();
  let scanLimited = false;
  let result: CiLogSearch;
  let fetchingRun = false;
  try {
    if (!asJson) {
      output.spinner('Finding recent Vercel CI runs…');
    }
    let cursor: string | undefined;
    const cursors = new Set<string>();
    // The list endpoint paginates attempts, not distinct runs.
    for (let page = 0; page < MAX_SCAN_PAGES; page++) {
      fetchingRun = false;
      const response = await listCiInvocations(
        client,
        {
          provider: git.provider,
          repository: git.repository,
          branch,
          // Filtering attempt rows can hide the newest state and spend the
          // scan budget on historical failures from recovered runs. Apply the
          // requested status only after resolving each run's latest attempt.
          limit: runCount,
          cursor,
        },
        accountId
      );
      for (const candidate of latestAttempts(response.invocations)) {
        if (
          toApiRunId(candidate.invocationId) !== candidate.invocationId ||
          !Number.isSafeInteger(candidate.attempt) ||
          candidate.attempt < 1
        ) {
          output.stopSpinner();
          return failCi(client, {
            reason: AGENT_REASON.API_ERROR,
            message:
              'Failed to find recent Vercel CI runs. The API returned an invalid run ID or attempt.',
          });
        }
        if (seen.has(candidate.invocationId)) continue;
        if (seen.size === MAX_SCAN_CANDIDATES) {
          scanLimited = true;
          break;
        }
        seen.add(candidate.invocationId);
        // Even an unfiltered page can stop before a run's newest attempt.
        // Resolve the latest state before applying status or searching logs.
        fetchingRun = true;
        const attempt = await getLatestCiAttempt(
          client,
          candidate.invocationId,
          accountId
        );
        if (!Number.isSafeInteger(attempt) || attempt < candidate.attempt) {
          output.stopSpinner();
          return failCi(client, {
            reason: AGENT_REASON.API_ERROR,
            message:
              'Failed to find recent Vercel CI runs. The API returned an invalid latest attempt.',
          });
        }
        const tree = await getCiInvocationTree(client, candidate.invocationId, {
          attempt,
          accountId,
        });
        const current = tree.invocation;
        if (
          current.invocationId !== candidate.invocationId ||
          current.attempt !== attempt
        ) {
          output.stopSpinner();
          return failCi(client, {
            reason: AGENT_REASON.API_ERROR,
            message:
              'Failed to find recent Vercel CI runs. The API returned an invalid latest attempt.',
          });
        }
        if (status && getRunStatus(current) !== status) continue;
        selected.set(current.invocationId, current);
        trees.set(current.invocationId, tree);
        if (selected.size === runCount) break;
      }
      if (
        scanLimited ||
        selected.size === runCount ||
        !response.pagination.nextCursor
      )
        break;
      cursor = response.pagination.nextCursor;
      if (cursors.has(cursor)) {
        output.stopSpinner();
        return failCi(client, {
          reason: AGENT_REASON.API_ERROR,
          message:
            'Failed to find recent Vercel CI runs. The API repeated a pagination cursor.',
        });
      }
      if (seen.size === MAX_SCAN_CANDIDATES || page === MAX_SCAN_PAGES - 1) {
        scanLimited = true;
        break;
      }
      cursors.add(cursor);
    }
  } catch (err) {
    output.stopSpinner();
    return fetchingRun
      ? handleCiApiError(client, 'find recent Vercel CI runs', err)
      : handleGrepApiError(client, 'find recent Vercel CI runs', err);
  }
  const runs = [...selected.values()];
  const selection = {
    requestedRuns: runCount,
    scannedRuns: seen.size,
    limited: scanLimited,
  };
  const scanNotice = scanLimited
    ? `Recent-run scan reached its limit after checking ${plural('run', seen.size, true)}. Results are partial; narrow with --git-branch${status ? ' or remove --status' : ' or fewer --runs'}.`
    : undefined;
  if (runs.length === 0) {
    output.stopSpinner();
    return printNoRuns(
      client,
      asJson,
      text,
      describeScope(git, branch),
      selection,
      scanNotice
    );
  }

  try {
    if (!asJson) {
      output.spinner(`Searching ${plural('run', runs.length, true)}…`);
    }
    result = await searchCiLogs(
      client,
      runs,
      { search: text, levels },
      accountId
    );
  } catch (err) {
    output.stopSpinner();
    return handleGrepApiError(client, 'search Vercel CI logs', err);
  }
  output.stopSpinner();

  const runsById = new Map(runs.map(run => [run.invocationId, run]));
  const matches = result.invocations.flatMap(match => {
    const run = runsById.get(match.invocationId);
    if (!run || match.attempt !== run.attempt) {
      return [];
    }
    const summary = {
      ...toRunSummary(run, {}),
      repository: git.repository,
    };
    const tasks = match.tasks.map(task => ({
      job: task.jobName,
      name: task.taskName,
      status: (task.conclusion?.result ?? 'running') as CiStepStatus,
      ...(task.conclusion && 'reason' in task.conclusion
        ? { reason: task.conclusion.reason }
        : {}),
      locator: {
        invocationId: run.invocationId,
        attempt: run.attempt,
        jobDefinitionId: task.jobDefinitionId,
        jobRunAttempt: task.jobRunAttempt,
        taskDefinitionId: task.taskDefinitionId,
        ...(task.taskRunAttempt !== undefined
          ? { taskRunAttempt: task.taskRunAttempt }
          : {}),
      },
      // Name-based logs cannot address historical job/task attempts or names
      // shared by multiple jobs. Never advertise those as exact follow-ups.
      ...(isAddressableTask(trees.get(run.invocationId)!, task)
        ? {
            command: buildCiCommand(client.argv, [
              'ci',
              'logs',
              summary.id,
              '--attempt',
              String(summary.attempt),
              `--task=${task.taskName}`,
            ]),
          }
        : {}),
      lines: task.lines
        .filter(line => line.level !== EOF_LEVEL)
        .map(line => ({
          timestamp: new Date(line.timestamp).toISOString(),
          level: line.level,
          message: line.message,
        })),
    }));
    return [{ run: summary, tasks }];
  });

  const lineCount = matches.reduce(
    (total, match) =>
      total + match.tasks.reduce((sum, task) => sum + task.lines.length, 0),
    0
  );
  const scope = describeScope(git, branch);

  if (asJson) {
    const payload = {
      search: text,
      searchedRuns: runs.length,
      selection,
      matches: {
        lines: lineCount,
        runs: matches.length,
      },
      runs: matches.map(({ run, tasks }) => ({ ...run, tasks })),
      hasMore: result.hasMore,
    };
    client.stdout.write(
      `${JSON.stringify(
        client.nonInteractive
          ? {
              status: AGENT_STATUS.OK,
              ...payload,
              next: [],
              message: [
                lineCount > 0
                  ? `Found ${plural('matching line', lineCount, true)} in ${plural('run', matches.length, true)} of ${plural('searched run', runs.length, true)} for ${plainScope(git, branch)}.`
                  : `No log lines match the search text in ${plural('searched run', runs.length, true)} for ${plainScope(git, branch)}.`,
                scanNotice,
              ]
                .filter(Boolean)
                .join(' '),
            }
          : payload,
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (scanNotice) output.print(`! ${scanNotice}\n`);
  output.log(
    `Searched ${scanLimited ? '' : 'the last '}${plural('run', runs.length, true)} for ${scope} for ${chalk.bold(`"${ciDisplayText(text)}"`)}`
  );
  if (matches.length === 0) {
    output.log(`No log lines match "${ciDisplayText(text)}".`);
    return 0;
  }

  const now = Date.now();
  for (const { run, tasks } of matches) {
    output.print('\n');
    output.log(describeRun(run, now, !branch));
    for (const task of tasks) {
      const reason = task.reason
        ? ` ${chalk.gray('·')} ${ciDisplayText(task.reason)}`
        : '';
      const execution = [
        `job attempt ${ciDisplayText(String(task.locator.jobRunAttempt))}`,
        ...(task.locator.taskRunAttempt !== undefined
          ? [
              `task attempt ${ciDisplayText(String(task.locator.taskRunAttempt))}`,
            ]
          : []),
      ].join(' · ');
      output.print(
        `  ${chalk.bold(`${ciDisplayText(task.job)} › ${ciDisplayText(task.name)}`)} ${chalk.gray('·')} ${execution} ${chalk.gray('·')} ${formatStatus(task.status)}${reason}\n`
      );
      if (task.command) {
        output.print(`  ${chalk.gray(ciDisplayText(task.command))}\n`);
      }
      for (const line of task.lines) {
        client.stdout.write(
          `    ${chalk.gray(formatTime(line.timestamp))}  ${ciDisplayText(line.level).padEnd(5)}  ${highlight(ciDisplayText(line.message), ciDisplayText(text))}\n`
        );
      }
    }
  }

  output.print('\n');
  output.log(
    `${plural('matching line', lineCount, true)} in ${plural('run', matches.length, true)} of ${runs.length} searched`
  );
  if (result.hasMore) {
    output.log(
      `Showing the newest ${lineCount} matching lines. Narrow with --status, --level, or fewer --runs.`
    );
  }
  return 0;
}

function isAddressableTask(
  tree: CiInvocationTree,
  task: CiTaskLogs['tasks'][number]
): boolean {
  const named = tree.jobs.flatMap(job =>
    job.tasks
      .filter(current => current.definition.name === task.taskName)
      .map(current => ({ job, current }))
  );
  if (named.length !== 1 || task.taskRunAttempt === undefined) return false;
  const { job, current } = named[0];
  return (
    job.definition.jobDefinitionId === task.jobDefinitionId &&
    job.run?.attempt === task.jobRunAttempt &&
    current.definition.jobDefinitionId === task.jobDefinitionId &&
    current.definition.jobRunAttempt === task.jobRunAttempt &&
    current.definition.taskDefinitionId === task.taskDefinitionId &&
    current.run?.taskDefinitionId === task.taskDefinitionId &&
    current.run.attempt === task.taskRunAttempt
  );
}

function latestAttempts(invocations: CiInvocation[]): CiInvocation[] {
  const latest = new Map<string, CiInvocation>();
  for (const invocation of invocations) {
    const current = latest.get(invocation.invocationId);
    if (!current || invocation.attempt > current.attempt) {
      latest.set(invocation.invocationId, invocation);
    }
  }
  return [...latest.values()];
}

function printNoRuns(
  client: Client,
  asJson: boolean,
  text: string,
  scope: string,
  selection: { requestedRuns: number; scannedRuns: number; limited: boolean },
  scanNotice: string | undefined
): number {
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          ...(client.nonInteractive
            ? {
                status: AGENT_STATUS.OK,
                message: selection.limited
                  ? `No Vercel CI runs match the current filters among the runs checked. ${scanNotice}`
                  : 'No Vercel CI runs match the current filters.',
                next: [],
              }
            : {}),
          search: text,
          searchedRuns: 0,
          selection,
          matches: { lines: 0, runs: 0 },
          runs: [],
          hasMore: false,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }
  if (scanNotice) output.print(`! ${scanNotice}\n`);
  output.log(
    selection.limited
      ? `No Vercel CI runs match the current filters among the runs checked for ${scope}.`
      : selection.scannedRuns > 0
        ? `No Vercel CI runs match the current filters for ${scope}.`
        : `No Vercel CI runs found for ${scope}.`
  );
  return 0;
}

function describeScope(
  git: { repository: string },
  branch: string | undefined
): string {
  const repo = chalk.bold(ciDisplayText(git.repository));
  return branch
    ? `${repo} on ${chalk.bold(ciDisplayText(branch))}`
    : `${repo} on all branches`;
}

function plainScope(
  git: { repository: string },
  branch: string | undefined
): string {
  return branch
    ? `${ciDisplayText(git.repository)} on ${ciDisplayText(branch)}`
    : `${ciDisplayText(git.repository)} on all branches`;
}

function describeRun(
  run: CiRunSummary,
  now: number,
  showBranch: boolean
): string {
  const parts = [
    `Run ${chalk.bold(ciDisplayText(run.id))}`,
    formatStatus(run.status),
    ...(run.attempt > 1 ? [`attempt ${run.attempt}`] : []),
    ...(showBranch ? [ciDisplayText(run.branch)] : []),
    ciDisplayText(toShortSha(run.commitSha)),
    `${ms(Math.max(now - Date.parse(run.createdAt), 0))} ago`,
  ];
  return parts.join(chalk.gray(' · '));
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

function highlight(message: string, text: string): string {
  const literal = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return message.replace(new RegExp(literal, 'giu'), match =>
    chalk.red.bold(match)
  );
}

function handleGrepApiError(
  client: Client,
  action: string,
  err: unknown
): number {
  if (isAPIError(err) && err.status === 404) {
    return failCi(client, {
      reason: AGENT_REASON.API_ERROR,
      message: `Failed to ${action}. The Vercel CI endpoint wasn't found.`,
    });
  }
  return handleCiApiError(client, action, err);
}
