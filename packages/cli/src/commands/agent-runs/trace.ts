import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import ellipsis from '../../util/output/ellipsis';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
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
  quoteCommandArgument,
  readNumber,
  readRecord,
  readString,
  type UnknownRecord,
} from './format';
import { AgentTraceTelemetryClient } from '../../util/telemetry/commands/agent-runs/trace';
import { printNextPageCommand } from '../../util/pagination';

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

type TracePage = {
  droppedSide?: 'oldest' | 'newest';
  earlier?: { streamId: string; beforeChunk: number };
  later?: { streamId: string; cursor: string };
};

type TraceContinuation =
  | {
      version: 1;
      direction: 'earlier';
      streamId: string;
      beforeChunk: number;
    }
  | {
      version: 1;
      direction: 'later';
      streamId: string;
      cursor: string;
    };

const MAX_CONTINUATION_LENGTH = 4096;

function readTracePage(data: unknown): TracePage | undefined {
  if (!isRecord(data)) return undefined;
  const trace = readRecord(data, 'trace') ?? data;
  const framework = readString(trace, 'framework');
  const payload =
    (framework ? readRecord(trace, framework) : undefined) ??
    readRecord(trace, 'eve');
  if (!payload) return undefined;

  const earlier = readRecord(payload, 'earlier');
  const later = readRecord(payload, 'later');
  const earlierStreamId = readString(earlier, 'streamId');
  const beforeChunk = readNumber(earlier, 'beforeChunk');
  const laterStreamId = readString(later, 'streamId');
  const cursor = readString(later, 'cursor');
  const droppedSide = readString(
    readRecord(payload, 'truncated'),
    'droppedSide'
  );
  return {
    ...(droppedSide === 'oldest' || droppedSide === 'newest'
      ? { droppedSide }
      : {}),
    ...(earlierStreamId &&
    beforeChunk !== undefined &&
    Number.isSafeInteger(beforeChunk) &&
    beforeChunk > 0
      ? { earlier: { streamId: earlierStreamId, beforeChunk } }
      : {}),
    ...(laterStreamId && cursor
      ? { later: { streamId: laterStreamId, cursor } }
      : {}),
  };
}

function encodeTraceContinuation(continuation: TraceContinuation): string {
  return Buffer.from(JSON.stringify(continuation), 'utf8').toString(
    'base64url'
  );
}

function parseTraceContinuation(value: string): TraceContinuation | undefined {
  if (
    value.length === 0 ||
    value.length > MAX_CONTINUATION_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return undefined;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8')
    );
    if (
      !isRecord(decoded) ||
      decoded.version !== 1 ||
      (decoded.direction !== 'earlier' && decoded.direction !== 'later') ||
      typeof decoded.streamId !== 'string' ||
      decoded.streamId.length === 0
    ) {
      return undefined;
    }
    if (
      decoded.direction === 'earlier' &&
      typeof decoded.beforeChunk === 'number' &&
      Number.isSafeInteger(decoded.beforeChunk) &&
      decoded.beforeChunk > 0 &&
      decoded.cursor === undefined
    ) {
      return decoded as TraceContinuation;
    }
    if (
      decoded.direction === 'later' &&
      typeof decoded.cursor === 'string' &&
      decoded.cursor.length > 0 &&
      decoded.beforeChunk === undefined
    ) {
      return decoded as TraceContinuation;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function buildTracePageCommand({
  runId,
  continuation,
  globalFlags,
  project,
  environment,
  since,
  until,
  maxFieldLength,
}: {
  runId: string;
  continuation: TraceContinuation;
  globalFlags: string[];
  project?: string;
  environment?: string;
  since?: string;
  until?: string;
  maxFieldLength?: number;
}): string {
  const args = [
    'vercel',
    ...globalFlags.map(flag => quoteCommandArgument(flag, '<value>')),
    'agent-runs',
    'trace',
    quoteCommandArgument(runId, '<runId>'),
  ];
  const optionalArgs: Array<[string, string | number | undefined]> = [
    ['--project', project],
    ['--environment', environment],
    ['--since', since],
    ['--until', until],
    ['--max-field-length', maxFieldLength],
  ];
  for (const [flag, value] of optionalArgs) {
    if (value === undefined) continue;
    args.push(flag, quoteCommandArgument(String(value), '<value>'));
  }
  args.push(
    continuation.direction === 'later' ? '--next' : '--previous',
    encodeTraceContinuation(continuation)
  );
  return args.join(' ');
}

function getTracePagination(
  tracePage: TracePage | undefined
): { next: string | null; previous: string | null } | undefined {
  if (!tracePage?.earlier && !tracePage?.later) return undefined;

  return {
    next: tracePage.later
      ? encodeTraceContinuation({
          version: 1,
          direction: 'later',
          ...tracePage.later,
        })
      : null,
    previous: tracePage.earlier
      ? encodeTraceContinuation({
          version: 1,
          direction: 'earlier',
          ...tracePage.earlier,
        })
      : null,
  };
}

function logTracePagination(
  tracePage: TracePage | undefined,
  {
    runId,
    globalFlags,
    project,
    environment,
    since,
    until,
    maxFieldLength,
  }: {
    runId: string;
    globalFlags: string[];
    project?: string;
    environment?: string;
    since?: string;
    until?: string;
    maxFieldLength?: number;
  }
): void {
  if (tracePage?.droppedSide) {
    output.log(
      `Trace coverage is incomplete: ${tracePage.droppedSide} activity was not returned in this page.`
    );
  }
  // `--previous` reads older activity and `--next` reads newer activity.
  if (tracePage?.earlier) {
    output.print('\n');
    printNextPageCommand(
      buildTracePageCommand({
        runId,
        continuation: {
          version: 1,
          direction: 'earlier',
          ...tracePage.earlier,
        },
        globalFlags,
        project,
        environment,
        since,
        until,
        maxFieldLength,
      }),
      'Previous page'
    );
  }
  if (tracePage?.later) {
    output.print('\n');
    printNextPageCommand(
      buildTracePageCommand({
        runId,
        continuation: {
          version: 1,
          direction: 'later',
          ...tracePage.later,
        },
        globalFlags,
        project,
        environment,
        since,
        until,
        maxFieldLength,
      })
    );
  }
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
    return 2;
  }

  const positional = parsedArgs.args.slice(1);
  const runIdArg =
    positional[0] === traceSubcommand.name ? positional[1] : positional[0];
  const {
    '--project': projectFlag,
    '--environment': environment,
    '--since': since,
    '--until': until,
    '--next': nextCursor,
    '--previous': previousCursor,
    '--max-field-length': maxFieldLengthFlag,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;

  telemetry.trackCliArgumentRunId(runIdArg);
  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionNext(nextCursor);
  telemetry.trackCliOptionPrevious(previousCursor);
  telemetry.trackCliOptionMaxFieldLength(maxFieldLengthFlag);
  telemetry.trackCliFlagJson(json);

  if (!runIdArg) {
    output.print(
      help(traceSubcommand, {
        stream: client.stderr,
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

  if (nextCursor !== undefined && previousCursor !== undefined) {
    return invalidArguments(
      client,
      '`--next` and `--previous` cannot be used together.'
    );
  }
  const continuationValue = nextCursor ?? previousCursor;
  const continuation =
    continuationValue !== undefined
      ? parseTraceContinuation(continuationValue)
      : undefined;
  const expectedDirection = nextCursor !== undefined ? 'later' : 'earlier';
  if (
    continuationValue !== undefined &&
    continuation?.direction !== expectedDirection
  ) {
    const flag = nextCursor !== undefined ? '--next' : '--previous';
    return invalidArguments(
      client,
      `Invalid or expired \`${flag}\` cursor. Omit \`${flag}\` to restart the trace.`
    );
  }

  const tracePageQuery =
    continuation?.direction === 'later'
      ? {
          traceStreamId: continuation.streamId,
          traceAfterCursor: continuation.cursor,
        }
      : continuation?.direction === 'earlier'
        ? {
            traceStreamId: continuation.streamId,
            traceBeforeChunk: continuation.beforeChunk,
          }
        : undefined;

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
      ...tracePageQuery,
    });
  } catch (err) {
    output.stopSpinner();
    handleAgentRunsApiError(client, err);
    return 1;
  }
  output.stopSpinner();

  const maxFieldLength = normalizeTraceMaxFieldLength(maxFieldLengthFlag);
  const bounded = truncateLargeStrings(data, maxFieldLength);
  const tracePage = readTracePage(data);
  const pagination = getTracePagination(tracePage);

  if (json) {
    const jsonPayload =
      pagination && isRecord(bounded) ? { ...bounded, pagination } : bounded;
    client.stdout.write(`${JSON.stringify(jsonPayload, null, 2)}\n`);
    return 0;
  }

  const rendered = isRecord(bounded)
    ? renderTrace(bounded, runIdArg)
    : undefined;
  const traceCommandContext = {
    runId: runIdArg,
    globalFlags: getGlobalFlagsFromArgs(client.argv.slice(2)),
    project: projectFlag,
    environment,
    since,
    until,
    maxFieldLength: maxFieldLengthFlag,
  };
  if (!rendered) {
    // Unrecognized trace shape — the raw payload is still useful.
    client.stdout.write(`${JSON.stringify(bounded, null, 2)}\n`);
    logTracePagination(tracePage, traceCommandContext);
    return 0;
  }

  client.stdout.write(rendered);
  logTracePagination(tracePage, traceCommandContext);
  output.log('Run with --json for raw trace data.');
  return 0;
}
