import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import { listSubcommand } from './command';
import {
  fetchAgentRuns,
  handleAgentRunsApiError,
  invalidArguments,
  resolveAgentRunsScope,
} from './agent-runs-api';
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
    return 1;
  }

  const {
    '--project': projectFlag,
    '--environment': environment,
    '--since': since,
    '--until': until,
    '--search': search,
    '--issue': issue,
    '--issue-code': issueCode,
    '--issue-type': issueType,
    '--issue-source': issueSource,
    '--issue-tool': issueTool,
    '--trigger': trigger,
    '--page': page,
    '--limit': limit,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;

  if (until && !since) {
    return invalidArguments(client, '`--until` requires `--since`.');
  }
  if (issue && issue !== 'error') {
    return invalidArguments(
      client,
      '`--issue` currently supports only `error`.'
    );
  }
  if (
    issueType &&
    issueType !== 'action_failed' &&
    issueType !== 'action_rejected' &&
    issueType !== 'step_failed' &&
    issueType !== 'turn_failed' &&
    issueType !== 'session_failed'
  ) {
    return invalidArguments(
      client,
      '`--issue-type` supports `action_failed`, `action_rejected`, `step_failed`, `turn_failed`, or `session_failed`.'
    );
  }
  const validatedIssueType =
    issueType === 'action_failed' ||
    issueType === 'action_rejected' ||
    issueType === 'step_failed' ||
    issueType === 'turn_failed' ||
    issueType === 'session_failed'
      ? issueType
      : undefined;
  if (
    issueSource &&
    issueSource !== 'remote_subagent' &&
    issueSource !== 'skill' &&
    issueSource !== 'subagent' &&
    issueSource !== 'tool' &&
    issueSource !== 'workflow'
  ) {
    return invalidArguments(
      client,
      '`--issue-source` supports `remote_subagent`, `skill`, `subagent`, `tool`, or `workflow`.'
    );
  }
  const validatedIssueSource =
    issueSource === 'remote_subagent' ||
    issueSource === 'skill' ||
    issueSource === 'subagent' ||
    issueSource === 'tool' ||
    issueSource === 'workflow'
      ? issueSource
      : undefined;
  if (
    trigger &&
    trigger !== 'slack' &&
    trigger !== 'http' &&
    trigger !== 'schedule' &&
    trigger !== 'manual' &&
    trigger !== 'unknown'
  ) {
    return invalidArguments(
      client,
      '`--trigger` supports `slack`, `http`, `schedule`, `manual`, or `unknown`.'
    );
  }
  const validatedTrigger =
    trigger === 'slack' ||
    trigger === 'http' ||
    trigger === 'schedule' ||
    trigger === 'manual' ||
    trigger === 'unknown'
      ? trigger
      : undefined;

  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionSearch(search);
  telemetry.trackCliOptionIssue(issue === 'error' ? issue : undefined);
  telemetry.trackCliOptionIssueCode(issueCode);
  telemetry.trackCliOptionIssueType(validatedIssueType);
  telemetry.trackCliOptionIssueSource(validatedIssueSource);
  telemetry.trackCliOptionIssueTool(issueTool);
  telemetry.trackCliOptionTrigger(validatedTrigger);
  telemetry.trackCliOptionPage(page);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliFlagJson(json);

  const scope = await resolveAgentRunsScope(client, {
    scopeFlag,
    projectFlag,
    requireProject: true,
  });
  if (!scope.ok) {
    return scope.exitCode;
  }

  const fetchStamp = stamp();
  output.spinner(`Fetching Agent Runs in ${chalk.bold(scope.contextName)}…`);
  let data;
  try {
    data = await fetchAgentRuns(client, {
      teamId: scope.teamId,
      projectId: scope.projectId,
      environment,
      since,
      until,
      page,
      pageSize: limit,
      search,
      issue:
        issue === 'error' || issueCode || issueType || issueSource || issueTool
          ? 'error'
          : undefined,
      issueCode,
      issueType: validatedIssueType,
      issueSource: validatedIssueSource,
      issueTool,
      trigger: validatedTrigger,
    });
  } catch (err) {
    output.stopSpinner();
    handleAgentRunsApiError(client, err);
    return 1;
  }
  output.stopSpinner();

  if (json) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }

  const runList = asArray(data.runs);
  if (runList.length === 0) {
    if (search || since) {
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

  const pagination =
    readRecord(data, 'pageInfo') ?? readRecord(data, 'pagination');
  const total = readNumber(pagination, 'total', 'totalCount');
  const currentPage = readNumber(pagination, 'page') ?? page ?? 1;
  const pageSize =
    readNumber(pagination, 'pageSize', 'limit') ?? limit ?? runList.length;
  const consumedRuns = Math.max(0, currentPage - 1) * pageSize + runList.length;
  if (total !== undefined && total > consumedRuns) {
    const nextPageArgs = ['vercel agent-runs list'];
    const pushFlag = (name: string, value: string | number | undefined) => {
      if (value !== undefined && value !== '') {
        nextPageArgs.push(`${name} ${shellQuoteArg(value)}`);
      }
    };
    pushFlag('--scope', scopeFlag);
    pushFlag('--project', projectFlag);
    pushFlag('--environment', environment);
    pushFlag('--since', since);
    pushFlag('--until', until);
    pushFlag('--search', search);
    pushFlag(
      '--issue',
      issue === 'error' || issueCode || issueType || issueSource || issueTool
        ? 'error'
        : undefined
    );
    pushFlag('--issue-code', issueCode);
    pushFlag('--issue-type', validatedIssueType);
    pushFlag('--issue-source', validatedIssueSource);
    pushFlag('--issue-tool', issueTool);
    pushFlag('--trigger', validatedTrigger);
    pushFlag('--limit', limit);
    pushFlag('--page', currentPage + 1);
    output.log(
      `Showing ${runList.length} of ${total} Agent Runs. Run ${cmd(nextPageArgs.join(' '))} for more.`
    );
  }
  output.log(
    `Run ${cmd('vercel agent-runs inspect <runId>')} for run details.`
  );
  return 0;
}

function shellQuoteArg(value: string | number): string {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) {
    return text;
  }

  return `'${text.replace(/'/g, "'\\''")}'`;
}
