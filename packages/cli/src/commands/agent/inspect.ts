import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import table from '../../util/output/table';
import { help } from '../help';
import { agentCommand, inspectSubcommand } from './command';
import {
  fetchAgentRuns,
  handleAgentRunsApiError,
  invalidArguments,
  resolveAgentRunsScope,
} from './agent-runs-api';
import {
  asArray,
  formatCount,
  formatDurationMs,
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
  runStatus,
  runTitle,
  runTotalTokens,
  runTrigger,
  type UnknownRecord,
} from './format';
import { AgentInspectTelemetryClient } from '../../util/telemetry/commands/agent/inspect';

function renderDetail(run: UnknownRecord): string {
  const usage = readRecord(run, 'usage');
  const rows: string[][] = [
    ['Run ID', runId(run)],
    ['Status', runStatus(run)],
  ];
  const title = runTitle(run);
  if (title) rows.push(['Title', title]);
  rows.push(
    ['Trigger', runTrigger(run)],
    ['Model', runModel(run)],
    ['Started', formatTimestamp(runStartedAtMs(run))],
    ['Duration', formatDurationMs(runDurationMs(run))]
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
      'Tokens',
      `${formatCount(input)} in / ${formatCount(outputTokens)} out / ${formatCount(total)} total`,
    ]);
  }

  const sections = [table(rows)];

  const events = asArray(run.events);
  if (events.length > 0) {
    const eventRows = [
      ['Time', 'Event'],
      ...events.map(event => [
        formatTimestamp(
          readTimestampMs(event, 'timestamp', 'createdAt', 'time', 'at')
        ),
        readString(event, 'type', 'name', 'event', 'message') ?? '-',
      ]),
    ];
    sections.push(`Events\n${table(eventRows)}`);
  }

  const subagents = asArray(run.subagents ?? run.subAgents);
  if (subagents.length > 0) {
    const subagentRows = [
      ['Subagent', 'Status', 'Model', 'Tokens', 'Duration'],
      ...subagents.map(subagent => [
        readString(subagent, 'name', 'id', 'runId') ?? '-',
        runStatus(subagent),
        runModel(subagent),
        formatCount(runTotalTokens(subagent)),
        formatDurationMs(runDurationMs(subagent)),
      ]),
    ];
    sections.push(`Subagents\n${table(subagentRows)}`);
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
        parent: agentCommand,
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
  output.log('Run with --json for full run data.');
  return 0;
}
