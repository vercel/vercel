import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import { normalizeFlagName } from '../../util/redact-args';
import {
  getNextPageCommand,
  printNextPageCommand,
} from '../../util/pagination';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import { listSubcommand } from './command';
import {
  fetchAgentRuns,
  handleAgentRunsApiError,
  invalidArguments,
  resolveAgentRunsScope,
  resolveAgentRunsWindow,
} from './agent-runs-api';
import {
  encodeAgentRunsListContinuation,
  encodeAgentRunsSourceCursor,
  getAgentRunsListFilters,
  parseAgentRunsListContinuation,
  type AgentRunsListContinuation,
  type AgentRunsListWindow,
} from './list-continuation';
import {
  asArray,
  formatAge,
  formatCount,
  formatDurationMs,
  formatRunStatus,
  readNumber,
  readRecord,
  runDurationMs,
  runId,
  runModel,
  runStartedAtMs,
  runTotalTokens,
  runTrigger,
} from './format';
import { AgentRunsListTelemetryClient } from '../../util/telemetry/commands/agent-runs/list';
import { warnDeprecatedOption } from '../../util/warn-deprecated-subcommand';
import {
  getRenamedOption,
  renameOptionInArgs,
  reportRenamedOptionError,
  withWarnings,
} from '../../util/renamed-option';

// The list endpoint's default range when it gets no `from`/`to`. The CLI sends
// it explicitly so every page of a list uses the same whole-second range.
const DEFAULT_LIST_WINDOW_SECONDS = 12 * 60 * 60;

function getDefaultListWindow(): AgentRunsListWindow {
  const to = Math.floor(Date.now() / 1000);
  return { from: to - DEFAULT_LIST_WINDOW_SECONDS, to };
}

function buildListPageCommand({
  argv,
  window,
  next,
}: {
  argv: string[];
  window?: AgentRunsListWindow;
  next: string;
}): string {
  const args = argv.slice(2);
  const delimiter = args.indexOf('--');
  const own = delimiter === -1 ? args : args.slice(0, delimiter);
  const passthrough = delimiter === -1 ? [] : args.slice(delimiter);
  const kept = argv.slice(0, 2);
  // A cursor carries its range; legacy page numbers need absolute time flags.
  for (let i = 0; i < own.length; i++) {
    const arg = own[i];
    const name = normalizeFlagName(arg);
    if (name === '--since' || name === '--until') {
      if (!arg.includes('=')) i++;
      continue;
    }
    kept.push(arg);
  }
  if (window) {
    kept.push(
      '--since',
      new Date(window.from * 1000).toISOString(),
      '--until',
      new Date(window.to * 1000).toISOString()
    );
  }
  return getNextPageCommand([...kept, ...passthrough], next, ['--page']);
}

function printNextPage(command: string): void {
  output.print('\n');
  printNextPageCommand(command);
}

export default async function list(client: Client): Promise<number> {
  const telemetry = new AgentRunsListTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const {
    '--project': projectFlag,
    '--environment': environment,
    '--since': since,
    '--until': until,
    '--query': queryFlag,
    '--search': searchFlag,
    '--next': next,
    '--page': legacyPage,
    '--limit': limit,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;
  if (legacyPage !== undefined) {
    warnDeprecatedOption(client.argv, '--page', '--next');
  }

  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionQuery(queryFlag);
  telemetry.trackCliOptionSearch(searchFlag);
  telemetry.trackCliOptionNext(next);
  telemetry.trackCliOptionPage(legacyPage);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliFlagJson(json);

  const query = getRenamedOption(parsedArgs.flags, '--query', '--search', {
    json,
  });
  if ('error' in query) {
    return reportRenamedOptionError(client, query.error, { json });
  }
  const search = query.value;

  if (until && !since) {
    return invalidArguments(client, '`--until` requires `--since`.');
  }
  if (next !== undefined && legacyPage !== undefined) {
    return invalidArguments(
      client,
      '`--next` and `--page` cannot be used together.'
    );
  }

  // A bare number is the page number `--next` accepted before cursors. The
  // endpoint honors it only for Workflow-only lists.
  const legacyNext =
    next !== undefined && /^\d+$/.test(next) ? Number(next) : undefined;
  let continuation: AgentRunsListContinuation | undefined;
  if (next !== undefined && legacyNext === undefined) {
    continuation = parseAgentRunsListContinuation(next);
    if (!continuation) {
      return invalidArguments(
        client,
        'Invalid or expired `--next` cursor. Omit `--next` to start from the first page.'
      );
    }
  }
  const page = continuation?.page ?? legacyNext ?? legacyPage;

  let requestedWindow: AgentRunsListWindow | undefined;
  try {
    requestedWindow = resolveAgentRunsWindow(since, until);
  } catch (err) {
    handleAgentRunsApiError(client, err);
    return 1;
  }
  let window = requestedWindow ?? getDefaultListWindow();
  if (continuation) {
    if (
      requestedWindow &&
      (requestedWindow.from !== continuation.window.from ||
        requestedWindow.to !== continuation.window.to)
    ) {
      return invalidArguments(
        client,
        '`--since` and `--until` must match the time range of the `--next` cursor. Omit them to continue the same list.'
      );
    }
    window = continuation.window;
  }

  const scope = await resolveAgentRunsScope(client, {
    scopeFlag,
    projectFlag,
    requireProject: true,
  });
  if (!scope.ok) {
    return scope.exitCode;
  }

  const filters = getAgentRunsListFilters({
    teamId: scope.teamId,
    projectId: scope.projectId,
    environment,
    search,
  });
  if (continuation && continuation.filters !== filters) {
    return invalidArguments(
      client,
      'The `--next` cursor belongs to a different list. Use the same scope, project, environment, and search, or omit `--next` to start from the first page.'
    );
  }

  const fetchStamp = stamp();
  output.spinner(`Fetching Agent Runs in ${chalk.bold(scope.contextName)}…`);
  let data;
  try {
    data = await fetchAgentRuns(client, {
      teamId: scope.teamId,
      projectId: scope.projectId,
      environment,
      window,
      page,
      pageSize: limit,
      search,
      cursor: continuation?.cursor,
    });
  } catch (err) {
    output.stopSpinner();
    handleAgentRunsApiError(client, err);
    return 1;
  }
  output.stopSpinner();

  // The merged Workflow and OTEL list reports `hasMore` and continues only
  // from `nextOffsets`; it ignores `page` and would return the first page.
  const pageInfo = readRecord(data, 'pageInfo');
  const cursorPaged =
    typeof pageInfo?.hasMore === 'boolean' ||
    pageInfo?.nextOffsets !== undefined;
  if (cursorPaged && !continuation && (page ?? 1) > 1) {
    return invalidArguments(
      client,
      'Page numbers cannot continue this Agent Runs list. Use the `--next` cursor from the previous page (`pagination.next` with `--json`).'
    );
  }

  let nextToken: string | null = null;
  if (cursorPaged && pageInfo?.hasMore === true) {
    const nextOffsets = readRecord(pageInfo, 'nextOffsets');
    const cursor = encodeAgentRunsSourceCursor(nextOffsets);
    if (cursor) {
      nextToken = encodeAgentRunsListContinuation({
        version: 1,
        cursor,
        page: (page ?? 1) + 1,
        window,
        filters,
      });
    }
  }

  if (json) {
    const payload = cursorPaged
      ? { ...data, pagination: { next: nextToken } }
      : data;
    client.stdout.write(
      `${JSON.stringify(withWarnings(payload, [query.warning]), null, 2)}\n`
    );
    return 0;
  }

  const pageCommand = {
    argv: renameOptionInArgs(client.argv, '--search', '--query'),
  };
  const runList = asArray(data.runs);
  if (runList.length === 0) {
    if (nextToken) {
      // A merged page can be empty while a later page still has runs.
      output.log('No Agent Runs on this page.');
      printNextPage(buildListPageCommand({ ...pageCommand, next: nextToken }));
    } else if (search || since) {
      output.log('No Agent Runs match the current filters.');
    } else {
      output.log('No Agent Runs found.');
    }
    return 0;
  }

  output.log(
    `Agent Runs under ${chalk.bold(scope.contextName)} ${fetchStamp()}`
  );

  const rows = [
    ['Run ID', 'Status', 'Trigger', 'Model', 'Tokens', 'Duration', 'Age'].map(
      header => chalk.bold(chalk.cyan(header))
    ),
    ...runList.map(run => [
      chalk.bold(runId(run)),
      formatRunStatus(run),
      runTrigger(run),
      runModel(run),
      formatCount(runTotalTokens(run)),
      chalk.gray(formatDurationMs(runDurationMs(run))),
      chalk.gray(formatAge(runStartedAtMs(run))),
    ]),
  ];
  client.stdout.write(`\n${table(rows, { hsep: 3 }).replace(/^/gm, '  ')}\n\n`);

  const pagination = pageInfo ?? readRecord(data, 'pagination');
  const total = readNumber(pagination, 'total', 'totalCount');
  const pageSize = readNumber(pagination, 'pageSize') ?? runList.length;
  const shown = ((page ?? 1) - 1) * pageSize + runList.length;
  if (total !== undefined && total > shown) {
    output.log(`Showing ${runList.length} of ${total} Agent Runs.`);
  }
  output.log(
    `Run ${cmd('vercel agent-runs inspect <runId>')} for run details.`
  );
  if (nextToken) {
    // The cursor carries the time range.
    printNextPage(buildListPageCommand({ ...pageCommand, next: nextToken }));
  } else if (pageInfo?.hasMore === true) {
    output.warning(
      'More Agent Runs are available, but the response has no usable cursor. Narrow `--since` and `--until` to list them.'
    );
  }

  if (!cursorPaged && total !== undefined && total > shown) {
    // Page numbers carry no state, so repeat the absolute time range.
    printNextPage(
      buildListPageCommand({
        ...pageCommand,
        window,
        next: String((page ?? 1) + 1),
      })
    );
  }
  return 0;
}
