import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import ellipsis from '../../util/output/ellipsis';
import { help } from '../help';
import { agentRunsCommand, traceSubcommand } from './command';
import {
  fetchAgentRuns,
  handleAgentRunsApiError,
  invalidArguments,
  normalizeTraceMaxFieldLength,
  resolveAgentRunsScope,
  truncateLargeStrings,
} from './agent-runs-api';
import {
  asArray,
  isRecord,
  readRecord,
  readString,
  type UnknownRecord,
} from './format';
import { AgentTraceTelemetryClient } from '../../util/telemetry/commands/agent-runs/trace';

const INLINE_VALUE_MAX_LEN = 2000;

function toDisplayString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pushBlock(lines: string[], label: string, value: unknown): void {
  const text = toDisplayString(value);
  if (!text) return;
  lines.push(`- **${label}:** ${ellipsis(text.trim(), INLINE_VALUE_MAX_LEN)}`);
}

function renderTurn(turn: UnknownRecord, index: number): string {
  const lines: string[] = [`## Turn ${index + 1}`];

  const messages = asArray(turn.messages);
  for (const message of messages) {
    const role = readString(message, 'role', 'type') ?? 'message';
    pushBlock(lines, role, message.content ?? message.text);
    pushBlock(lines, `${role} reasoning`, message.reasoning);
  }
  pushBlock(lines, 'reasoning', turn.reasoning);

  const toolCalls = asArray(turn.toolCalls ?? turn.tool_calls);
  for (const toolCall of toolCalls) {
    const name =
      readString(toolCall, 'name', 'toolName', 'tool') ?? '<unnamed tool>';
    lines.push(`- **tool call:** \`${name}\``);
    const input = toDisplayString(
      toolCall.input ?? toolCall.args ?? toolCall.arguments
    );
    if (input) {
      lines.push(`  - input: ${ellipsis(input.trim(), INLINE_VALUE_MAX_LEN)}`);
    }
    const outputValue = toDisplayString(toolCall.output ?? toolCall.result);
    if (outputValue) {
      lines.push(
        `  - output: ${ellipsis(outputValue.trim(), INLINE_VALUE_MAX_LEN)}`
      );
    }
  }

  return lines.join('\n');
}

function resolveTurns(trace: UnknownRecord): UnknownRecord[] {
  const direct = asArray(trace.turns);
  if (direct.length > 0) return direct;
  // Frameworks nest their payload under a key named after the framework
  // (e.g. `trace.eve.turns`); `framework` names that key when present.
  const framework = readString(trace, 'framework');
  if (framework) {
    const nested = asArray(readRecord(trace, framework)?.turns);
    if (nested.length > 0) return nested;
  }
  for (const value of Object.values(trace)) {
    if (isRecord(value)) {
      const nested = asArray(value.turns);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function renderTrace(
  data: UnknownRecord,
  runIdArg: string
): string | undefined {
  const trace = readRecord(data, 'trace') ?? data;
  const turns = resolveTurns(trace);
  if (turns.length === 0) {
    return undefined;
  }
  const sections = [
    `# Agent Run ${runIdArg}`,
    `- **Turns:** ${turns.length}`,
    ...turns.map((turn, index) => renderTurn(turn, index)),
  ];
  return `${sections.join('\n\n')}\n`;
}

export default async function trace(client: Client): Promise<number> {
  const telemetry = new AgentTraceTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(traceSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const positional = parsedArgs.args.slice(1);
  const runIdArg =
    positional[0] === traceSubcommand.name ? positional[1] : positional[0];
  const {
    '--project': projectFlag,
    '--environment': environment,
    '--since': since,
    '--until': until,
    '--max-field-length': maxFieldLengthFlag,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;

  telemetry.trackCliArgumentRunId(runIdArg);
  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionMaxFieldLength(maxFieldLengthFlag);
  telemetry.trackCliFlagJson(json);

  if (!runIdArg) {
    output.print(
      help(traceSubcommand, {
        parent: agentRunsCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  if (until && !since) {
    return invalidArguments(client, '`--until` requires `--since`.');
  }
  if (
    maxFieldLengthFlag !== undefined &&
    (!Number.isFinite(maxFieldLengthFlag) || maxFieldLengthFlag < 0)
  ) {
    return invalidArguments(
      client,
      '`--max-field-length` must be a non-negative number.'
    );
  }

  const scope = await resolveAgentRunsScope(client, {
    scopeFlag,
    projectFlag,
    requireProject: true,
  });
  if (!scope.ok) {
    return scope.exitCode;
  }

  output.spinner('Fetching Agent Run trace…');
  let data;
  try {
    data = await fetchAgentRuns(client, {
      teamId: scope.teamId,
      projectId: scope.projectId,
      environment,
      since,
      until,
      runId: runIdArg,
      trace: true,
    });
  } catch (err) {
    output.stopSpinner();
    handleAgentRunsApiError(client, err);
    return 1;
  }
  output.stopSpinner();

  const maxFieldLength = normalizeTraceMaxFieldLength(maxFieldLengthFlag);
  const bounded = truncateLargeStrings(data, maxFieldLength);

  if (json) {
    client.stdout.write(`${JSON.stringify(bounded, null, 2)}\n`);
    return 0;
  }

  const rendered = isRecord(bounded)
    ? renderTrace(bounded, runIdArg)
    : undefined;
  if (!rendered) {
    // Unrecognized trace shape — the raw payload is still useful.
    client.stdout.write(`${JSON.stringify(bounded, null, 2)}\n`);
    return 0;
  }

  client.stdout.write(rendered);
  output.log('Run with --json for full trace data.');
  return 0;
}
