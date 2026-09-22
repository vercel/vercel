import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import table from '../../util/output/table';
import { help } from '../help';
import { agentRunsCommand, inspectSubcommand } from './command';
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
  formatTimestamp,
  isRecord,
  readNumber,
  readRecord,
  readString,
  readTimestampMs,
  runDurationMs,
  runId,
  runModel,
  runStartedAtMs,
  runTitle,
  runTotalTokens,
  runTrigger,
  type UnknownRecord,
} from './format';
import { AgentInspectTelemetryClient } from '../../util/telemetry/commands/agent-runs/inspect';

function formatStartedAt(run: UnknownRecord): string {
  const startedAt = runStartedAtMs(run);
  if (startedAt === undefined) return '-';
  return `${formatAge(startedAt)} ${chalk.gray(formatTimestamp(startedAt))}`;
}

function renderDetail(run: UnknownRecord): string {
  const usage = readRecord(run, 'usage');
  const rows: string[][] = [
    [chalk.bold('Run ID'), runId(run)],
    [chalk.bold('Status'), formatRunStatus(run)],
  ];
  const title = runTitle(run);
  if (title) rows.push([chalk.bold('Title'), title]);
  rows.push(
    [chalk.bold('Trigger'), runTrigger(run)],
    [chalk.bold('Model'), runModel(run)],
    [chalk.bold('Started'), formatStartedAt(run)],
    [chalk.bold('Duration'), formatDurationMs(runDurationMs(run))]
  );
  const input = readNumber(usage, 'inputTokens', 'promptTokens', 'input');
  const outputTokens = readNumber(
    usage,
    'outputTokens',
    'completionTokens',
    'output'
  );
  const total = runTotalTokens(run);
  if (
    input !== undefined ||
    outputTokens !== undefined ||
    total !== undefined
  ) {
    rows.push([
      chalk.bold('Tokens'),
      `${formatCount(input)} in / ${formatCount(outputTokens)} out / ${formatCount(total)} total`,
    ]);
  }

  const sections = [table(rows, { hsep: 3 })];

  const events = asArray(run.events);
  if (events.length > 0) {
    const eventTimes = events.map(event =>
      readTimestampMs(event, 'timestamp', 'createdAt', 'time', 'at')
    );
    const knownTimes = [runStartedAtMs(run), ...eventTimes].filter(
      (time): time is number => time !== undefined
    );
    const baseTime = knownTimes.length ? Math.min(...knownTimes) : undefined;
    const eventRows = [
      ['Time', 'Event'].map(header => chalk.bold(chalk.cyan(header))),
      ...events.map((event, index) => {
        const time = eventTimes[index];
        const offset =
          time !== undefined && baseTime !== undefined && time >= baseTime
            ? `+${formatDurationMs(time - baseTime)}`
            : formatTimestamp(time);
        return [
          chalk.gray(offset),
          readString(event, 'type', 'name', 'event', 'message') ?? '-',
        ];
      }),
    ];
    sections.push(`${chalk.bold('Events')}\n${table(eventRows, { hsep: 3 })}`);
  }

  const subagents = asArray(run.subagents ?? run.subAgents);
  if (subagents.length > 0) {
    const subagentRows = [
      ['Subagent', 'Status', 'Model', 'Tokens', 'Duration'].map(header =>
        chalk.bold(chalk.cyan(header))
      ),
      ...subagents.map(subagent => [
        chalk.bold(readString(subagent, 'name', 'id', 'runId') ?? '-'),
        formatRunStatus(subagent),
        runModel(subagent),
        formatCount(runTotalTokens(subagent)),
        chalk.gray(formatDurationMs(runDurationMs(subagent))),
      ]),
    ];
    sections.push(
      `${chalk.bold('Subagents')}\n${table(subagentRows, { hsep: 3 })}`
    );
  }

  return `${sections.join('\n\n')}\n`;
}

export default async function inspect(client: Client): Promise<number> {
  const telemetry = new AgentInspectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const positional = parsedArgs.args.slice(1);
  const runIdArg =
    positional[0] === inspectSubcommand.name ? positional[1] : positional[0];
  const {
    '--project': projectFlag,
    '--environment': environment,
    '--since': since,
    '--until': until,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;

  telemetry.trackCliArgumentRunId(runIdArg);
  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliFlagJson(json);

  if (!runIdArg) {
    output.print(
      help(inspectSubcommand, {
        parent: agentRunsCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  if (until && !since) {
    return invalidArguments(client, '`--until` requires `--since`.');
  }

  const scope = await resolveAgentRunsScope(client, {
    scopeFlag,
    projectFlag,
    requireProject: true,
  });
  if (!scope.ok) {
    return scope.exitCode;
  }

  output.spinner('Fetching Agent Run…');
  let data;
  try {
    data = await fetchAgentRuns(client, {
      teamId: scope.teamId,
      projectId: scope.projectId,
      environment,
      since,
      until,
      runId: runIdArg,
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

  const run = isRecord(data.run) ? data.run : data;
  client.stdout.write(renderDetail(run));
  output.log(`Run with ${cmd('--json')} for full run data.`);
  return 0;
}
