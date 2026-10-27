import chalk from 'chalk';
import { z } from 'zod';
import type Client from '../../util/client';
import output from '../../output-manager';
import { getErrorRecovery } from '../../util/error-recovery';
import { isAPIError } from '../../util/errors-ts';
import { quoteArg } from '../../util/flags/quote-arg';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import {
  type EventsResult,
  type ExcludedInterval,
  fetchEventPages,
  InvalidEventsResponseError,
  RecordTooLargeError,
  sortIntervals,
} from '../../util/observability/events';
import {
  recordLine,
  summaryLine,
  writeJsonError,
} from '../../util/observability/jsonl';
import { warningLine } from '../logs/json-output';
import table from '../../util/output/table';
import ellipsis from '../../util/output/ellipsis';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { printNextPageCommand } from '../../util/pagination';
import { getRenamedOption } from '../../util/renamed-option';
import type { TracesTelemetryClient } from '../../util/telemetry/commands/traces';
import { searchSubcommand } from './command';
import {
  addSpanQueryIssueDetails,
  resolveSpanContinuation,
  resolveSpanQuery,
  trackSpanQueryOptions,
  isoDateTimeSchema,
  spanContinuationToken,
  spanEventsRequest,
  SPAN_KINDS,
  type SpanQuery,
} from './query';
import {
  handleTracingApiError,
  invalidArguments,
  tracingErrorMessage,
  tracingErrorReason,
} from './config/errors';

const INVALID_RESPONSE_MESSAGE =
  'The Observability API returned an invalid span search response.';

const spanSchema = z.object({
  span: z
    .object({
      startTime: isoDateTimeSchema,
      traceId: z.string(),
      id: z.string(),
      parentSpanId: z.string().nullable(),
      isRoot: z.number(),
      traceState: z.string(),
      name: z.string(),
      kind: z.string(),
      status: z.object({
        code: z.string(),
        message: z.string(),
      }),
      duration: z.number(),
      attributes: z.record(z.string(), z.unknown()),
      events: z
        .array(
          z.object({
            name: z.string(),
            timestamp: isoDateTimeSchema,
            attributes: z.record(z.string(), z.unknown()),
          })
        )
        .optional(),
      links: z
        .array(
          z.object({
            traceId: z.string(),
            spanId: z.string(),
            traceState: z.string(),
            attributes: z.record(z.string(), z.unknown()),
          })
        )
        .optional(),
    })
    .passthrough(),
  resource: z.object({
    attributes: z.record(z.string(), z.unknown()),
  }),
});

const spansSchema = z.array(spanSchema);

type Span = z.infer<typeof spanSchema>;

function formatDuration(durationMs: number): string {
  if (durationMs === 0) return '0ms';
  if (durationMs < 0.000001) return '<1ns';
  const units = [
    [0.000001, 'ns'],
    [0.001, 'μs'],
    [1, 'ms'],
    [1000, 's'],
    [60_000, 'm'],
    [3_600_000, 'h'],
    [86_400_000, 'd'],
  ] as const;
  let index = units.length - 1;
  while (durationMs < units[index][0]) index--;
  let value = Number((durationMs / units[index][0]).toFixed(1));
  if (
    index < units.length - 1 &&
    value >= Math.round(units[index + 1][0] / units[index][0])
  ) {
    index++;
    value = Number((durationMs / units[index][0]).toFixed(1));
  }
  return `${value}${units[index][1]}`;
}

function cell(value: string | null): string {
  return value || '-';
}

function stringAttribute(
  attributes: Record<string, unknown>,
  key: string
): string | null {
  const value = attributes[key];
  return typeof value === 'string' ? value : null;
}

const spanColumns = {
  'span.startTime': {
    header: 'TIME',
    format: event => new Date(event.span.startTime).toISOString(),
  },
  'span.duration': {
    header: 'DURATION',
    format: event => formatDuration(event.span.duration),
  },
  'span.name': {
    header: 'SPAN NAME',
    format: event => ellipsis(cell(event.span.name), 60),
  },
  'span.status.code': {
    header: 'STATUS',
    format: event =>
      event.span.status.code.toUpperCase() === 'ERROR'
        ? chalk.red('ERROR')
        : cell(event.span.status.code.toUpperCase()),
  },
  'service.name': {
    header: 'SERVICE NAME',
    format: event => {
      const serviceName = stringAttribute(
        event.resource.attributes,
        'service.name'
      );
      return serviceName?.startsWith('vercel.')
        ? `▲ ${serviceName}`
        : cell(serviceName);
    },
  },
  environment: {
    header: 'ENVIRONMENT',
    format: event =>
      cell(
        stringAttribute(
          event.resource.attributes,
          'deployment.environment.name'
        )
      ),
  },
  'request.id': {
    header: 'REQUEST ID',
    format: event =>
      stringAttribute(event.span.attributes, 'vercel.request_id')
        ?.split('::')
        .at(-1) || '-',
  },
  'trace.id': {
    header: 'TRACE ID',
    format: event => cell(event.span.traceId),
  },
  'span.id': {
    header: 'SPAN ID',
    format: event => cell(event.span.id),
  },
  'parent.id': {
    header: 'PARENT ID',
    format: event => cell(event.span.parentSpanId),
  },
  'span.kind': {
    header: 'SPAN KIND',
    format: event =>
      SPAN_KINDS.find(
        (kind, index) =>
          event.span.kind === String(index) ||
          event.span.kind.toUpperCase() === kind
      ) ?? cell(event.span.kind),
  },
} satisfies Record<string, { header: string; format: (span: Span) => string }>;

function printSpans(
  client: Client,
  spans: Span[],
  columns: (typeof spanColumns)[keyof typeof spanColumns][]
): void {
  if (spans.length === 0) {
    client.stdout.write('No spans found for this period.\n');
    return;
  }

  client.stdout.write(
    `${table([
      columns.map(column => column.header),
      ...spans.map(span => columns.map(column => column.format(span))),
    ])}\n`
  );
}

export default async function search(
  client: Client,
  telemetry: TracesTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), {
      ...getFlagsSpecification(searchSubcommand.options),
      // Hidden: `--json` is the only documented way to ask for JSON.
      '-j': '--json',
    });
  } catch (err) {
    return invalidArguments(
      client,
      err instanceof Error ? err.message : String(err)
    );
  }

  const { flags } = parsedArgs;
  const json = Boolean(flags['--json'] || client.nonInteractive);
  const columnsOption = flags['--columns'];
  telemetry.trackCliOptionColumns(columnsOption);
  if (parsedArgs.args.slice(2).length > 0) {
    trackSpanQueryOptions(flags, telemetry);
    return invalidArguments(
      client,
      `Unexpected argument: ${parsedArgs.args.slice(2)[0]}.`
    );
  }
  const deployment = getRenamedOption(
    flags,
    '--deployment',
    '--deployment-id',
    {
      json,
    }
  );
  if ('error' in deployment) {
    trackSpanQueryOptions(flags, telemetry);
    return invalidArguments(client, deployment.error);
  }
  const trace = getRenamedOption(flags, '--trace', '--trace-id', { json });
  if ('error' in trace) {
    trackSpanQueryOptions(flags, telemetry);
    return invalidArguments(client, trace.error);
  }
  const span = getRenamedOption(flags, '--span', '--span-id', { json });
  if ('error' in span) {
    trackSpanQueryOptions(flags, telemetry);
    return invalidArguments(client, span.error);
  }
  let columns = Object.values(spanColumns).filter(
    column =>
      column !== spanColumns['span.kind'] &&
      column !== spanColumns['request.id'] &&
      column !== spanColumns.environment
  );
  if (columnsOption !== undefined) {
    if (json) {
      return invalidArguments(
        client,
        '`--columns` cannot be combined with `--json` or `--non-interactive`.'
      );
    }
    const names = columnsOption.split(',').map(name => name.trim());
    if (names.some(name => !Object.hasOwn(spanColumns, name))) {
      return invalidArguments(
        client,
        `Invalid column selection. Available columns: ${Object.keys(spanColumns).join(', ')}.`
      );
    }
    if (new Set(names).size !== names.length) {
      return invalidArguments(
        client,
        'Columns cannot repeat. List each column once.'
      );
    }
    columns = names.map(name => spanColumns[name as keyof typeof spanColumns]);
  }
  const resolved =
    flags['--next'] !== undefined
      ? resolveSpanContinuation(client, flags, telemetry)
      : await resolveSpanQuery(client, flags, telemetry);
  if ('exitCode' in resolved) return resolved.exitCode;
  const query: SpanQuery = resolved;
  for (const { warning } of [deployment, trace, span]) {
    if (warning) {
      client.stdout.write(warningLine(warning));
    }
  }

  // The token carries the team, project, filters, and window, so only the
  // output mode, page size, and columns carry over to the next page. The
  // resolved format is kept even when it came from `--non-interactive` or
  // agent detection, and an explicit interaction override is repeated so the
  // next run resolves the same way.
  const interactionOverride = explicitInteractionOverride(client.argv);
  const nextPageArgs = (token: string): string =>
    [
      'traces search',
      `--next ${token}`,
      ...(json ? ['--json'] : []),
      ...(interactionOverride ? [interactionOverride] : []),
      ...(flags['--limit'] !== undefined
        ? [`--limit ${flags['--limit']}`]
        : []),
      ...(columnsOption !== undefined
        ? [`--columns ${quoteArg(columnsOption)}`]
        : []),
    ].join(' ');

  const pages = fetchEventPages(
    client,
    spanEventsRequest(query),
    query.limit,
    query.startCursor
  );
  const spans: Span[] = [];
  const excludedIntervals = new Map<string, ExcludedInterval>();
  let received = 0;
  // The cursor after the last page received, used to retry a failed page.
  let resumeCursor = query.startCursor;
  let result: EventsResult;

  if (!json) output.spinner('Searching spans…');
  for (;;) {
    let page;
    try {
      page = await pages.next();
    } catch (err) {
      return reportFailure(err);
    }
    if (page.done) {
      result = page.value;
      break;
    }
    const parsed = spansSchema.safeParse(page.value.events);
    if (!parsed.success) {
      return reportFailure(new InvalidEventsResponseError());
    }
    for (const interval of page.value.excludedIntervals) {
      excludedIntervals.set(`${interval.start}/${interval.end}`, interval);
    }
    if (json) {
      // Write the unchanged API event so fields the CLI doesn't know about
      // pass through.
      client.stdout.write(
        page.value.events.map(event => recordLine('span', event)).join('')
      );
    } else {
      spans.push(...parsed.data);
    }
    received += page.value.events.length;
    resumeCursor = page.value.nextCursor ?? undefined;
  }
  if (!json) output.stopSpinner();

  const intervals = sortIntervals(excludedIntervals.values());
  const nextToken = result.nextCursor
    ? spanContinuationToken(query, result.nextCursor)
    : null;

  if (json) {
    client.stdout.write(
      summaryLine({
        recordsReturned: received,
        timeRange: query.timeRange,
        pagination: { hasMore: result.hasMore, next: nextToken },
        excludedIntervals: intervals,
      })
    );
    return 0;
  }

  printSpans(client, spans, columns);
  if (intervals.length > 0) {
    output.warning(
      'Results omit part of this window: some data is unavailable to this query. Use --json to see the excluded intervals.'
    );
  }
  if (result.hasMore) {
    output.log('More spans matched.');
    if (nextToken) {
      output.print('\n');
      printNextPageCommand(getCommandNamePlain(nextPageArgs(nextToken)));
    } else {
      output.print('Narrow the query or increase --limit to see the rest.\n');
    }
  }
  return 0;

  function reportFailure(err: unknown): number {
    if (!json) output.stopSpinner();
    if (err instanceof InvalidEventsResponseError) {
      err = new Error(INVALID_RESPONSE_MESSAGE);
    }
    // API details first, then the CLI's advice, so the hint reads last.
    addSpanQueryIssueDetails(err);
    if (
      query.startCursor &&
      received === 0 &&
      isAPIError(err) &&
      err.status === 400
    ) {
      err.serverMessage = `${err.serverMessage}. The cursor may have expired. Run the search again without --next.`;
      err.message = `${err.serverMessage} (${err.status})`;
    }

    // Retrying from the same cursor reaches the same oversized record, so
    // that failure gets no retry command.
    const retryToken =
      received > 0 && resumeCursor && !(err instanceof RecordTooLargeError)
        ? spanContinuationToken(query, resumeCursor)
        : null;

    // Once span lines are on stdout, a failure must not add anything there:
    // one compact error document goes to stderr instead of a summary, like
    // `vercel logs`, and the process keeps running so telemetry flushes.
    if (json && received > 0) {
      return writeJsonError(
        client,
        {
          status: 'error',
          reason: tracingErrorReason(err),
          message: tracingErrorMessage(err),
          ...(isAPIError(err) && err.status === 429
            ? getErrorRecovery(err, client)
            : {}),
          data: progressFor(query, received, retryToken, excludedIntervals),
          ...(retryToken
            ? {
                next: [
                  {
                    command: getCommandNamePlain(nextPageArgs(retryToken)),
                    when: 'Retry the failed page',
                  },
                ],
              }
            : {}),
        },
        1
      );
    }

    // Spans already received stay in the output; the error says how many and
    // how to fetch the page that failed.
    if (!json && spans.length > 0) {
      printSpans(client, spans, columns);
    }
    const exitCode = handleTracingApiError(client, err);
    if (received > 0) {
      output.error(
        `Output is incomplete: ${received} spans were printed before the failure.`
      );
      if (retryToken) {
        output.print(
          `Retry the failed page:\n  ${getCommandName(nextPageArgs(retryToken))}\n`
        );
      }
    }
    return exitCode;
  }
}

/**
 * The `--non-interactive` override on the command line, normalized to how the
 * entry point resolves it: `--non-interactive=false` turns it off, any other
 * use turns it on. (`--non-interactive false` with a separate value fails
 * this command's parser as an unexpected argument, so it never gets here.)
 */
function explicitInteractionOverride(argv: string[]): string | undefined {
  const args = argv.slice(2);
  const end = args.indexOf('--');
  for (const arg of end === -1 ? args : args.slice(0, end)) {
    if (arg === '--non-interactive=false') return '--non-interactive=false';
    if (arg === '--non-interactive' || arg.startsWith('--non-interactive=')) {
      return '--non-interactive';
    }
  }
  return undefined;
}

function progressFor(
  query: SpanQuery,
  received: number,
  retryToken: string | null,
  excludedIntervals: Map<string, ExcludedInterval>
) {
  return {
    recordsReturned: received,
    outputIncomplete: true,
    timeRange: query.timeRange,
    pagination: { hasMore: true, next: retryToken },
    excludedIntervals: sortIntervals(excludedIntervals.values()),
  };
}
