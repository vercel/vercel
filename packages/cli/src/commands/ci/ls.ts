import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { getGlobalFlagsFromArgv } from '../../util/agent-output';
import { GLOBAL_CLI_FLAG_NAMES } from '../../util/arg-common';
import { quoteCiCommandArg, ciDisplayText } from '../../util/ci/output';
import { getCommandNamePlain } from '../../util/pkg-name';
import { applyDeprecatedGitBranchFlag } from '../../util/git-branch-option';
import { printNextPageCommand } from '../../util/pagination';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AGENT_STATUS } from '../../util/agent-output-constants';
import { listCiInvocations } from '../../util/ci/api';
import { resolveCommitSha } from '../../util/ci/git-context';
import { toDisplayRunId } from '../../util/ci/ids';
import {
  CI_RUN_STATUSES,
  getRunStatus,
  toBranchName,
  toRunStatusFilter,
  toShortSha,
  type CiRunStatus,
} from '../../util/ci/run-status';
import type { CiInvocation } from '../../util/ci/types';
import { toRunSummary } from '../../util/ci/run-view';
import { CiLsTelemetryClient } from '../../util/telemetry/commands/ci/ls';
import { listSubcommand } from './command';
import { resolveCiContext } from './context';
import { formatCiTable, formatStatus } from './render';
import { handleCiApiError, invalidCiArguments } from './errors';

const MAX_LIMIT = 100;
const SAFE_CURSOR_PATTERN = /^[A-Za-z0-9_\-.=+/]+$/;

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CiLsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(listSubcommand.options)
    );
  } catch (error) {
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;

  telemetry.trackCliOptionGitBranch(flags['--git-branch']);
  telemetry.trackCliOptionBranch(flags['--branch']);
  telemetry.trackCliFlagAllBranches(flags['--all-branches']);
  telemetry.trackCliOptionCommit(flags['--commit']);
  telemetry.trackCliOptionStatus(flags['--status']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (args.length > 0) {
    return invalidCiArguments(
      client,
      `\`${getCommandNamePlain('ci ls')}\` doesn't take arguments. Filter runs with --git-branch, --commit, or --status.`
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

  if (flags['--commit'] && flags['--all-branches']) {
    return invalidCiArguments(
      client,
      "Can't combine --commit with --all-branches. Commit filters require a branch."
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

  const limit = flags['--limit'];
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
  ) {
    return invalidCiArguments(
      client,
      `--limit must be a whole number from 1 to ${MAX_LIMIT}.`
    );
  }

  const context = await resolveCiContext(client);
  if (typeof context === 'number') {
    return context;
  }
  const { git, accountId } = context;

  let commitSha: string | undefined;
  if (flags['--commit']) {
    const resolved = await resolveCommitSha(client.cwd, flags['--commit']);
    if (!resolved) {
      return invalidCiArguments(
        client,
        "Couldn't resolve --commit to a commit in this repository. Pass the full 40-character SHA."
      );
    }
    commitSha = resolved;
  }

  const branch = flags['--all-branches']
    ? undefined
    : (flags['--git-branch'] ?? git.branch);
  if (commitSha && !branch) {
    return invalidCiArguments(
      client,
      '--commit requires a branch. Pass --git-branch when HEAD is detached.'
    );
  }

  const lsStamp = stamp();
  if (!asJson) {
    output.spinner('Fetching Vercel CI runs…');
  }

  let invocations: CiInvocation[];
  let nextCursor: string | undefined;
  try {
    const response = await listCiInvocations(
      client,
      {
        provider: git.provider,
        repository: git.repository,
        branch,
        commitSha,
        ...(status ? toRunStatusFilter(status as CiRunStatus) : {}),
        limit,
        cursor: flags['--next'],
      },
      accountId
    );
    invocations = commitSha
      ? response.invocations.filter(inv => inv.commitSha === commitSha)
      : response.invocations;
    nextCursor = response.pagination.nextCursor;
  } catch (err) {
    output.stopSpinner();
    return handleCiApiError(client, 'list Vercel CI runs', err);
  }
  output.stopSpinner();

  const runs = invocations.map(invocation => ({
    ...toRunSummary(invocation, {}),
    repository: git.repository,
  }));

  const nextArgs =
    nextCursor && SAFE_CURSOR_PATTERN.test(nextCursor)
      ? [
          'ci ls',
          ...Object.entries(flags).flatMap(([flag, value]) => {
            if (flag === '--next' || GLOBAL_CLI_FLAG_NAMES.has(flag)) {
              return [];
            }
            return typeof value === 'boolean'
              ? value
                ? [flag]
                : []
              : [flag, quoteCiCommandArg(String(value))];
          }),
          ...getGlobalFlagsFromArgv(client.argv).map(quoteCiCommandArg),
          '--next',
          nextCursor,
        ].join(' ')
      : undefined;

  if (asJson) {
    const payload = {
      runs,
      pagination: { next: nextCursor ?? null },
    };
    const agentPayload = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          ...payload,
          message: runs.length
            ? `Found ${plural('Vercel CI run', runs.length, true)}.`
            : 'No Vercel CI runs found.',
          next: [
            ...(nextArgs
              ? [
                  {
                    command: getCommandNamePlain(nextArgs),
                    when: 'Show the next page of runs',
                  },
                ]
              : []),
          ],
        }
      : payload;
    client.stdout.write(`${JSON.stringify(agentPayload, null, 2)}\n`);
    return 0;
  }

  const scope = describeScope(git.repository, branch, commitSha);
  if (runs.length === 0) {
    const filtered = Boolean(status || commitSha || flags['--next']);
    output.log(
      filtered
        ? 'No Vercel CI runs match the current filters.'
        : `No Vercel CI runs found for ${scope}.`
    );
    return 0;
  }

  output.log(
    `${plural('Vercel CI run', runs.length, true)} for ${scope} ${chalk.gray(lsStamp())}`
  );
  output.print(`\n${formatRunsTable(invocations)}\n\n`);
  if (nextArgs) {
    printNextPageCommand(getCommandNamePlain(nextArgs));
  }

  return 0;
}

function describeScope(
  repository: string,
  branch: string | undefined,
  commitSha: string | undefined
): string {
  const repo = chalk.bold(ciDisplayText(repository));
  if (commitSha) {
    return `${repo} at ${chalk.bold(toShortSha(commitSha))}`;
  }
  return branch
    ? `${repo} on ${chalk.bold(ciDisplayText(branch))}`
    : `${repo} on all branches`;
}

function formatRunsTable(invocations: CiInvocation[]): string {
  const now = Date.now();
  const rows = invocations.map(invocation => [
    ciDisplayText(toDisplayRunId(invocation.invocationId)),
    formatStatus(getRunStatus(invocation)),
    ciDisplayText(toBranchName(invocation.ref)),
    toShortSha(invocation.commitSha),
    chalk.gray(ms(Math.max(now - invocation.createdAt, 0))),
  ]);

  return formatCiTable(['Run', 'Status', 'Branch', 'Commit', 'Age'], rows);
}
