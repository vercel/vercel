import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import output from '../../../../src/output-manager';
import * as linkModule from '../../../../src/util/projects/link';
import { handleTracingApiError } from '../../../../src/commands/traces/config/errors';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { join } from 'path';
import { ensureDir, outputJSON } from 'fs-extra';
import {
  decodeContinuation,
  encodeContinuation,
  type EventsContinuation,
} from '../../../../src/util/observability/continuation';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const now = Date.parse('2026-09-08T12:00:00.000Z');
const initialColorLevel = chalk.level;

const sampleSpan = {
  timestamp: '2026-09-08T11:30:00.000Z',
  traceId: 'trace_001',
  spanId: 'span_001',
  parentSpanId: null,
  isRoot: 1,
  traceState: '',
  environment: 'production',
  serviceName: 'checkout-api',
  spanName: 'POST /api/checkout',
  spanKind: 'Server',
  statusCode: 'Error',
  statusMessage: 'payment failed',
  durationMs: 1250,
  deploymentId: 'dpl_001',
  requestId: 'req_001',
  resourceAttributes: { 'service.name': 'checkout-api' },
  spanAttributes: { 'http.status_code': '500' },
  events: [
    {
      name: 'payment.authorized',
      timestamp: '2026-09-08T11:30:00.500Z',
      attributes: { 'payment.provider': 'stripe' },
    },
  ],
  links: [
    {
      traceId: 'linked_trace_001',
      spanId: 'linked_span_001',
      traceState: 'vendor=value',
      attributes: { reason: 'retry' },
    },
  ],
};

type TestSpan = Omit<typeof sampleSpan, 'parentSpanId'> & {
  parentSpanId: string | null;
};

function toApiSpan(span: TestSpan) {
  return {
    span: {
      startTime: span.timestamp,
      traceId: span.traceId,
      id: span.spanId,
      parentSpanId: span.parentSpanId,
      isRoot: span.isRoot,
      traceState: span.traceState,
      name: span.spanName,
      kind: span.spanKind,
      status: {
        code: span.statusCode,
        message: span.statusMessage,
      },
      duration: span.durationMs,
      attributes: {
        ...span.spanAttributes,
        'vercel.request_id': span.requestId,
      },
      events: span.events,
      links: span.links,
    },
    resource: {
      attributes: {
        ...span.resourceAttributes,
        'deployment.environment.name': span.environment,
        'service.name': span.serviceName,
      },
    },
  };
}

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_test',
      name: 'traces-project',
      accountId: 'team_dummy',
      updatedAt: now,
      createdAt: now,
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  });
}

function respondWithSpans(spans: TestSpan[] = [sampleSpan], hasMore = false) {
  return {
    events: spans.map(toApiSpan),
    pagination: { hasMore, nextCursor: hasMore ? 'cursor_001' : null },
    meta: {},
  };
}

type JsonLine = { type: string; data?: unknown } & Record<string, unknown>;

function jsonLines(): JsonLine[] {
  return client.stdout
    .getFullOutput()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

/** The API events from `span` lines, in order. */
function spanRecords(): unknown[] {
  return jsonLines()
    .filter(line => line.type === 'span')
    .map(line => line.data);
}

function summaryRecord(): JsonLine {
  const lines = jsonLines();
  expect(lines.at(-1)?.type).toBe('summary');
  return lines.at(-1)!;
}

describe('vercel traces search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.cwd = setupTmpDir();
    useUser();
    useTeam('team_dummy');
    vi.mocked(linkModule.getLinkFromDir).mockResolvedValue({
      orgId: 'team_dummy',
      projectId: 'prj_test',
    });
    mockLinkedProject();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    chalk.level = initialColorLevel;
    client.nonInteractive = false;
  });

  it('routes help to the search subcommand', async () => {
    client.setArgv('traces', 'search', '--help');

    expect(await traces(client)).toBe(0);
    const renderedHelp = stripAnsi(client.stderr.getFullOutput());
    expect(renderedHelp).toContain('traces search');
    expect(renderedHelp).toContain('--request-id');
    expect(renderedHelp).toContain('--span <SPAN>');
    expect(renderedHelp).not.toContain('--span-id');
    expect(renderedHelp).toContain('--root');
    expect(renderedHelp).toContain('--kind');
    expect(renderedHelp).not.toContain('--span-kind');
    expect(renderedHelp).toContain('--columns');
    expect(renderedHelp).toMatch(/internal\s+\(1\)/);
    const helpOutput = stripAnsi(client.stderr.getFullOutput()).replace(
      /\s+/g,
      ' '
    );
    expect(helpOutput).toContain('Results are newest first.');
    expect(helpOutput).toContain(
      'Default: all except environment, request.id, and span.kind.'
    );
    expect(helpOutput).toContain(
      'Search team spans. Use --project to filter one project.'
    );
    expect(helpOutput).toContain(
      'Filter spans to one project (default: all team projects)'
    );
    expect(helpOutput).toContain('Duration filters do not sort results.');
    expect(helpOutput).toContain("--query 'span.duration > 2000'");
    expect(helpOutput).toContain('Find production errors for one service');
    expect(helpOutput).not.toContain('Search spans from the last hour');
    expect(helpOutput).not.toContain('Find spans for one request');
    expect(helpOutput).not.toContain('Find root spans');
    expect(helpOutput).toContain("--query 'NOT span.name:app/lib/fetch-api*'");
    expect(helpOutput).toContain(
      `--query 'NOT span.name:("GET /screenshot/v2" OR "middleware GET")'`
    );
    expect(helpOutput).toContain(
      'Use NOT to exclude values. End a value with * to match a prefix.'
    );
    expect(helpOutput).toContain(
      'Wrap values with spaces in double quotes. Keep the full query in single quotes.'
    );
    expect(helpOutput).toContain(
      '--columns span.startTime,span.duration,span.name,span.kind,span.status.code'
    );
    expect(helpOutput).toContain('Table columns');
    expect(helpOutput).toContain(
      'Available: span.startTime, span.duration, span.name, span.status.code, service.name, environment, request.id, trace.id, span.id, parent.id, span.kind'
    );
    expect(helpOutput).toContain('KQL filters');
    for (const field of [
      'project.id',
      'environment',
      'service.name',
      'deployment.id',
      'request.id',
      'user.id',
      'session.id',
      'span.name',
      'span.kind',
      'span.id',
      'parent.id',
      'span.isRoot',
      'span.status.code',
      'span.duration',
      'trace.id',
      'trace.state',
    ]) {
      expect(helpOutput).toContain(field);
    }
    expect(helpOutput).toContain(
      'Other fields search span attributes first, then resource attributes.'
    );
    expect(helpOutput).toContain('span.duration uses milliseconds.');
    expect(helpOutput).toContain(
      'span.kind uses the numeric values shown under --kind.'
    );
    expect(helpOutput).toContain('span.status.code uses Error, Ok, or Unset.');
    expect(helpOutput).toContain(
      'Use field:value filters. Plain text search is not supported.'
    );
    expect(helpOutput).not.toContain('normalized');
    expect(helpOutput).not.toContain('Choose table columns and their order');
    expect(helpOutput).not.toContain('means over 2 seconds');
    expect(helpOutput).not.toContain('Request-ID lookup');
    expect(helpOutput).not.toContain('matching root');
    expect(helpOutput).not.toContain('30 minutes');
    expect(helpOutput).toContain('Some IDs return 404 in traces inspect.');
    expect(helpOutput).toContain('Reuse --scope and --project.');
    expect(helpOutput).toContain('See traces inspect --help.');
    expect(helpOutput).not.toContain('Duration ranking');
    expect(helpOutput).not.toContain('traces aggregate');
    expect(client.stdout.getFullOutput()).toBe('');
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('queries recent spans and prints a table', async () => {
    let requestBody: unknown;
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.query).toEqual({ teamId: 'team_dummy' });
      expect(req.headers.authorization).toBe('Bearer token_dummy');
      expect(req.headers['x-vercel-observability-query-reason']).toBe(
        'cli/traces-search'
      );
      requestBody = req.body;
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search');

    expect(await traces(client)).toBe(0);
    expect(requestBody).toEqual({
      event: 'vercel.span',
      scope: { ownerId: 'team_dummy' },
      timeRange: {
        start: '2026-09-08T11:00:00.000Z',
        end: '2026-09-08T12:00:00.000Z',
      },
      select: ['span', 'resource'],
      order: 'desc',
      limit: 100,
      filter: 'NOT (service.name:vercel.* AND span.kind:1)',
    });
    const stdout = client.stdout.getFullOutput();
    const [header, row] = stdout.trim().split('\n');
    expect(header.trim().split(/\s{2,}/)).toEqual([
      'TIME',
      'DURATION',
      'SPAN NAME',
      'STATUS',
      'SERVICE NAME',
      'TRACE ID',
      'SPAN ID',
      'PARENT ID',
    ]);
    expect(row.trim().split(/\s{2,}/)).toEqual([
      sampleSpan.timestamp,
      '1.3s',
      'POST /api/checkout',
      'ERROR',
      'checkout-api',
      'trace_001',
      'span_001',
      '-',
    ]);
    expect(stdout).toContain('checkout-api');
    expect(stdout).toContain('POST /api/checkout');
    expect(stdout).toContain('1.3s');
    expect(stdout).toContain('trace_001');
  });

  it('filters spans to an explicit project', async () => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.scope).toEqual({
        ownerId: 'team_dummy',
        projectIds: ['prj_test'],
      });
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search', '--project', 'traces-project');

    expect(await traces(client)).toBe(0);
  });

  it.each([
    ['POST /api/checkout', 'POST /api/checkout'],
    ['a'.repeat(60), 'a'.repeat(60)],
    ['a'.repeat(61), `${'a'.repeat(59)}…`],
    ['GET /api/'.repeat(30), `${'GET /api/'.repeat(30).slice(0, 59)}…`],
    ['', '-'],
  ])('caps displayed span names at 60 characters: %s', async (spanName, expected) => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([{ ...sampleSpan, spanName }]));
    });
    client.setArgv('traces', 'search');
    chalk.level = 1;

    expect(await traces(client)).toBe(0);
    const row = client.stdout.getFullOutput().trim().split('\n')[1];
    const cells = stripAnsi(row)
      .trim()
      .split(/\s{2,}/);
    expect(cells[2]).toBe(expected);
    expect(row).not.toContain(chalk.red(expected));
    expect(cells.slice(5)).toEqual(['trace_001', 'span_001', '-']);
  });

  it.each([
    [0, '0ms'],
    [0.0000005, '<1ns'],
    [0.000001, '1ns'],
    [0.0000254, '25.4ns'],
    [0.00099996, '1μs'],
    [0.001, '1μs'],
    [0.0425, '42.5μs'],
    [0.99996, '1ms'],
    [1, '1ms'],
    [42.56, '42.6ms'],
    [999.96, '1s'],
    [1000, '1s'],
    [1250, '1.3s'],
    [59960, '1m'],
    [60000, '1m'],
    [90000, '1.5m'],
    [3600000, '1h'],
    [5400000, '1.5h'],
    [86400000, '1d'],
    [129600000, '1.5d'],
  ])('formats %s milliseconds as %s', async (durationMs, expected) => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([{ ...sampleSpan, durationMs }]));
    });
    client.setArgv('traces', 'search', '--no-color');
    expect(await traces(client)).toBe(0);
    const row = client.stdout.getFullOutput().trim().split('\n')[1];
    expect(row.trim().split(/\s{2,}/)[1]).toBe(expected);
  });

  it('preserves raw durations and numeric kinds in JSON', async () => {
    const spans = [0.0000254, 0.0425, 42.56, 1250].map(durationMs => ({
      ...sampleSpan,
      durationMs,
      spanKind: '2',
    }));
    client.scenario.post('/v1/observability/events', (_req, res) =>
      res.json(respondWithSpans(spans))
    );
    client.setArgv('traces', 'search', '--json');
    chalk.level = 1;
    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual(spans.map(toApiSpan));
  });

  it('still accepts -j, the hidden short form of --json', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search', '-j');

    expect(await traces(client)).toBe(0);
    expect(jsonLines()[0]).toEqual({
      type: 'span',
      data: toApiSpan(sampleSpan),
    });
  });

  it('prints JSON Lines without a spinner in non-interactive mode', async () => {
    const spinner = vi.spyOn(output, 'spinner');
    const stopSpinner = vi.spyOn(output, 'stopSpinner');
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans());
    });
    client.nonInteractive = true;
    client.setArgv('traces', 'search');

    expect(await traces(client)).toBe(0);
    expect(jsonLines()).toEqual([
      { type: 'span', data: toApiSpan(sampleSpan) },
      {
        type: 'summary',
        recordsReturned: 1,
        timeRange: {
          start: '2026-09-08T11:00:00.000Z',
          end: '2026-09-08T12:00:00.000Z',
        },
        pagination: { hasMore: false, next: null },
        excludedIntervals: [],
      },
    ]);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(spinner).not.toHaveBeenCalled();
    expect(stopSpinner).not.toHaveBeenCalled();
  });

  it('prints only a summary for empty non-interactive results', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([]));
    });
    client.nonInteractive = true;
    client.setArgv('traces', 'search');

    expect(await traces(client)).toBe(0);
    expect(jsonLines()).toHaveLength(1);
    expect(summaryRecord()).toMatchObject({
      recordsReturned: 0,
      pagination: { hasMore: false, next: null },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('preserves unknown span fields in JSON', async () => {
    const event = toApiSpan(sampleSpan);
    const responseEvent = {
      ...event,
      span: {
        ...event.span,
        futureField: { nested: true },
      },
    };
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json({
        events: [responseEvent],
        pagination: { hasMore: false, nextCursor: null },
        meta: {},
      });
    });
    client.setArgv('traces', 'search', '--json');

    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual([responseEvent]);
  });

  it('accepts spans without events or links during API rollout', async () => {
    const event = toApiSpan(sampleSpan);
    const legacySpan: Record<string, unknown> = { ...event.span };
    delete legacySpan.events;
    delete legacySpan.links;
    const responseEvent = { ...event, span: legacySpan };
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json({
        events: [responseEvent],
        pagination: { hasMore: false, nextCursor: null },
        meta: {},
      });
    });
    client.setArgv('traces', 'search', '--json');

    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual([responseEvent]);
  });

  it.each([
    [
      'events',
      [{ name: 'payment.authorized', timestamp: 'invalid', attributes: {} }],
    ],
    [
      'links',
      [
        {
          traceId: 123,
          spanId: 'linked_span_001',
          traceState: '',
          attributes: {},
        },
      ],
    ],
  ])('rejects malformed span %s', async (field, value) => {
    const event = toApiSpan(sampleSpan);
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json({
        events: [{ ...event, span: { ...event.span, [field]: value } }],
        pagination: { hasMore: false, nextCursor: null },
        meta: {},
      });
    });
    client.setArgv('traces', 'search', '--json');

    expect(await traces(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'invalid span search response'
    );
  });

  it.each([
    true,
    false,
  ])('selects and reorders columns, TTY: %s', async isTTY => {
    client.stdout.isTTY = isTTY;
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.select).toContain('resource');
      expect(req.body.select).not.toContain('resourceAttributes');
      expect(req.body).not.toHaveProperty('columns');
      res.json(respondWithSpans());
    });
    client.setArgv(
      'traces',
      'search',
      '--columns',
      ' span.status.code, span.duration, span.name ',
      '--no-color'
    );
    expect(await traces(client)).toBe(0);
    const lines = client.stdout.getFullOutput().trim().split('\n');
    expect(lines.map(line => line.trim().split(/\s{2,}/))).toEqual([
      ['STATUS', 'DURATION', 'SPAN NAME'],
      ['ERROR', '1.3s', 'POST /api/checkout'],
    ]);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:search', value: 'search' },
      { key: 'option:columns', value: '[REDACTED]' },
    ]);
  });

  it.each([
    'span.status.code,span.name',
    'span.name,span.status.code',
    'span.name',
  ])('colors only the selected status: %s', async columns => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([{ ...sampleSpan, spanName: 'ERROR' }]));
    });
    client.setArgv('traces', 'search', '--columns', columns);
    chalk.level = 1;
    expect(await traces(client)).toBe(0);
    const text = client.stdout.getFullOutput();
    if (columns.includes('span.status.code')) {
      expect(text).toContain(chalk.red('ERROR'));
      expect(text.replace(chalk.red('ERROR'), 'ERROR')).toBe(stripAnsi(text));
    } else {
      expect(text).toBe(stripAnsi(text));
    }
  });

  it.each([
    ['0', 'UNSPECIFIED'],
    ['1', 'INTERNAL'],
    ['2', 'SERVER'],
    ['3', 'CLIENT'],
    ['4', 'PRODUCER'],
    ['5', 'CONSUMER'],
    ['Server', 'SERVER'],
    ['internal', 'INTERNAL'],
    ['unknown-kind', 'unknown-kind'],
    ['', '-'],
  ])('renders kind %j as %s', async (spanKind, expected) => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([{ ...sampleSpan, spanKind }]));
    });
    client.setArgv(
      'traces',
      'search',
      '--columns',
      'span.kind,span.status.code'
    );
    chalk.level = 1;
    expect(await traces(client)).toBe(0);
    const [header, row] = client.stdout.getFullOutput().trim().split('\n');
    expect(header.trim().split(/\s{2,}/)).toEqual(['SPAN KIND', 'STATUS']);
    expect(
      stripAnsi(row)
        .trim()
        .split(/\s{2,}/)
    ).toEqual([expected, 'ERROR']);
    expect(row).toContain(chalk.red('ERROR'));
    expect(row.replace(chalk.red('ERROR'), 'ERROR')).toBe(stripAnsi(row));
  });

  it('preserves formatting when default columns are reordered', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(
        respondWithSpans([
          {
            ...sampleSpan,
            serviceName: 'vercel.request',
            requestId: 'bom1::req_001',
          },
        ])
      );
    });
    client.setArgv(
      'traces',
      'search',
      '--columns',
      'parent.id,span.id,trace.id,request.id,service.name,span.status.code,span.name,span.duration,span.startTime',
      '--no-color'
    );
    expect(await traces(client)).toBe(0);
    expect(
      client.stdout
        .getFullOutput()
        .trim()
        .split('\n')
        .map(line => line.trim().split(/\s{2,}/))
    ).toEqual([
      [
        'PARENT ID',
        'SPAN ID',
        'TRACE ID',
        'REQUEST ID',
        'SERVICE NAME',
        'STATUS',
        'SPAN NAME',
        'DURATION',
        'TIME',
      ],
      [
        '-',
        'span_001',
        'trace_001',
        'req_001',
        '▲ vercel.request',
        'ERROR',
        'POST /api/checkout',
        '1.3s',
        sampleSpan.timestamp,
      ],
    ]);
  });

  it('preserves empty-result output with selected columns', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) =>
      res.json(respondWithSpans([]))
    );
    client.setArgv('traces', 'search', '--columns', 'span.name');
    expect(await traces(client)).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(
      'No spans found for this period.\n'
    );
  });

  it.each([
    '',
    ' ',
    ',',
    'span.name,',
    ',span.name',
    'span.name,,span.status.code',
    'unknown',
    'NAME',
    'span',
    'span-kind',
    'span-id',
    'duration',
    'name',
    'status',
    'service',
    'request-id',
    'trace-id',
    'id',
    'parent-id',
    'kind',
    'time',
    'resource.attributes.service.name',
    'span.attributes.vercel.request_id',
    'span.traceId',
    'span.parentSpanId',
    'constructor',
    '__proto__',
  ])('rejects invalid columns: %j', async columns => {
    client.setArgv('traces', 'search', '--columns', columns);
    expect(await traces(client)).toBe(2);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'Available columns: span.startTime, span.duration, span.name, span.status.code, service.name, environment, request.id, trace.id, span.id, parent.id, span.kind'
    );
  });

  it.each([
    'span.name,span.name',
    'span.name, span.name',
  ])('rejects duplicate columns: %s', async columns => {
    client.setArgv('traces', 'search', '--columns', columns);
    expect(await traces(client)).toBe(2);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('Columns cannot repeat');
  });

  it('rejects columns with JSON before scope resolution', async () => {
    client.setArgv('traces', 'search', '--columns', 'span.name', '--json');
    expect(await traces(client)).toBe(2);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toContain('cannot be combined');
  });

  it('rejects columns in non-interactive mode before scope resolution', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    client.nonInteractive = true;
    client.setArgv('traces', 'search', '--columns', 'span.name');
    await expect(traces(client)).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledExactlyOnceWith(2);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toBe('');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('--non-interactive'),
    });
  });

  it('colors only error status red and uppercases all statuses', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(
        respondWithSpans([
          sampleSpan,
          { ...sampleSpan, statusCode: 'Unset' },
          { ...sampleSpan, statusCode: 'Ok' },
        ])
      );
    });
    client.setArgv('traces', 'search');
    chalk.level = 1;

    expect(await traces(client)).toBe(0);
    const [header, errorRow, unsetRow, okRow] = client.stdout
      .getFullOutput()
      .trim()
      .split('\n');
    expect(errorRow).toContain(chalk.red('ERROR'));
    expect(errorRow.replace(chalk.red('ERROR'), 'ERROR')).toBe(
      stripAnsi(errorRow)
    );
    expect(header).toBe(stripAnsi(header));
    expect(unsetRow).toBe(stripAnsi(unsetRow));
    expect(okRow).toBe(stripAnsi(okRow));
    expect(unsetRow.trim().split(/\s{2,}/)[3]).toBe('UNSET');
    expect(okRow.trim().split(/\s{2,}/)[3]).toBe('OK');
  });

  it.each([
    ['vercel.request', '▲ vercel.request'],
    ['vercel.', '▲ vercel.'],
    ['vercel', 'vercel'],
    ['Vercel.request', 'Vercel.request'],
    ['custom.vercel.request', 'custom.vercel.request'],
  ])('marks only vercel.-prefixed service names: %s', async (serviceName, expected) => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(
        respondWithSpans([
          { ...sampleSpan, serviceName, spanName: 'vercel.request' },
        ])
      );
    });
    client.setArgv('traces', 'search');
    chalk.level = 1;

    expect(await traces(client)).toBe(0);
    const row = client.stdout.getFullOutput().trim().split('\n')[1];
    expect(
      stripAnsi(row)
        .trim()
        .split(/\s{2,}/)[4]
    ).toBe(expected);
    expect(
      stripAnsi(row)
        .trim()
        .split(/\s{2,}/)[2]
    ).toBe('vercel.request');
    expect(row).not.toContain(chalk.red(expected));
  });

  it.each([
    [
      'bom1:sfo1:sfo1:sfo1::jg4mg-1788873998427-f8a6e810fc06',
      'jg4mg-1788873998427-f8a6e810fc06',
    ],
    ['sfo1::request_123', 'request_123'],
    ['sfo1:request_123', 'sfo1:request_123'],
    ['bom1::sfo1::request_123', 'request_123'],
    ['request_123', 'request_123'],
    ['sfo1::', '-'],
  ])('removes routing prefixes from displayed request IDs: %s', async (requestId, expected) => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([{ ...sampleSpan, requestId }]));
    });
    client.setArgv('traces', 'search', '--columns', 'request.id', '--no-color');

    expect(await traces(client)).toBe(0);
    const row = client.stdout.getFullOutput().trim().split('\n')[1];
    expect(row.trim()).toBe(expected);
  });

  it('shows a placeholder for spans without a request ID', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(
        respondWithSpans([sampleSpan, { ...sampleSpan, requestId: '' }])
      );
    });
    client.setArgv('traces', 'search', '--columns', 'request.id', '--no-color');

    expect(await traces(client)).toBe(0);
    const rows = client.stdout.getFullOutput().trim().split('\n').slice(1);
    expect(rows.map(row => row.trim())).toEqual(['req_001', '-']);
  });

  it('shows placeholders for missing or non-string attributes', async () => {
    const event = toApiSpan(sampleSpan);
    const missingAttributes = {
      ...event,
      span: { ...event.span, attributes: {} },
      resource: { attributes: {} },
    };
    const nonStringAttributes = {
      ...event,
      span: { ...event.span, attributes: { 'vercel.request_id': 42 } },
      resource: {
        attributes: {
          'deployment.environment.name': 42,
          'service.name': 42,
        },
      },
    };
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json({
        events: [missingAttributes, nonStringAttributes],
        pagination: { hasMore: false, nextCursor: null },
        meta: {},
      });
    });
    client.setArgv(
      'traces',
      'search',
      '--columns',
      'service.name,environment,request.id',
      '--no-color'
    );

    expect(await traces(client)).toBe(0);
    const rows = client.stdout.getFullOutput().trim().split('\n').slice(1);
    expect(rows.map(row => row.trim().split(/\s{2,}/))).toEqual([
      ['-', '-', '-'],
      ['-', '-', '-'],
    ]);
  });

  it('renders environment from resource attributes when selected', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans());
    });
    client.setArgv(
      'traces',
      'search',
      '--columns',
      'environment',
      '--no-color'
    );

    expect(await traces(client)).toBe(0);
    const [header, row] = client.stdout.getFullOutput().trim().split('\n');
    expect(header.trim()).toBe('ENVIRONMENT');
    expect(row.trim()).toBe('production');
  });

  it('uses a single dash for missing request IDs in selected columns', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([{ ...sampleSpan, requestId: '' }]));
    });
    client.setArgv('traces', 'search', '--columns', 'request.id', '--no-color');
    expect(await traces(client)).toBe(0);
    expect(client.stdout.getFullOutput().trim().split('\n')[1].trim()).toBe(
      '-'
    );
  });

  it('preserves empty request IDs in JSON', async () => {
    const span = { ...sampleSpan, requestId: '' };
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([span]));
    });
    client.setArgv('traces', 'search', '--json');
    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual([toApiSpan(span)]);
  });

  it('respects --no-color for error rows', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans());
    });
    chalk.level = 1;
    client.setArgv('traces', 'search', '--no-color');

    expect(await traces(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toBe(stripAnsi(stdout));
    expect(stdout).toContain('ERROR');
  });

  it.each([
    'parent_001',
    '',
    null,
  ])('displays parent span ID: %s', async parentSpanId => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([{ ...sampleSpan, parentSpanId }]));
    });
    client.setArgv('traces', 'search', '--no-color');

    expect(await traces(client)).toBe(0);
    const row = client.stdout.getFullOutput().trim().split('\n')[1];
    expect(row.trim().split(/\s{2,}/)[7]).toBe(parentSpanId || '-');
  });

  it('preserves raw statuses and omits colors in JSON output', async () => {
    const spans = [
      {
        ...sampleSpan,
        serviceName: 'vercel.request',
        spanName: 'GET /api/'.repeat(30),
        requestId: 'bom1:sfo1:sfo1:sfo1::jg4mg-1788873998427-f8a6e810fc06',
      },
      { ...sampleSpan, statusCode: 'Unset' },
    ];
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans(spans));
    });
    client.setArgv('traces', 'search', '--json');
    chalk.level = 1;

    expect(await traces(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toBe(stripAnsi(stdout));
    expect(spanRecords()).toEqual(spans.map(toApiSpan));
  });

  it('combines escaped direct filters with KQL and prints JSON Lines', async () => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        'NOT (service.name:vercel.* AND span.kind:1) AND (http.route:"/api/checkout") AND environment:"production" AND service.name:"checkout\\"api" AND span.name:"payment" AND span.status.code:"Error" AND deployment.id:"dpl_001" AND request.id:"req_001" AND trace.id:"trace_001"'
      );
      expect(req.body.limit).toBe(12);
      expect(req.body.timeRange).toEqual({
        start: '2026-09-08T10:00:00.000Z',
        end: '2026-09-08T11:00:00.000Z',
      });
      res.json(respondWithSpans());
    });
    client.setArgv(
      'traces',
      'search',
      '--environment',
      'production',
      '--service',
      'checkout"api',
      '--status',
      'error',
      '--name',
      'payment',
      '--deployment',
      'dpl_001',
      '--request-id',
      'req_001',
      '--trace-id',
      'trace_001',
      '--query',
      'http.route:"/api/checkout"',
      '--since',
      '2026-09-08T10:00:00Z',
      '--until',
      '2026-09-08T11:00:00Z',
      '--limit',
      '12',
      '--json'
    );

    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual([toApiSpan(sampleSpan)]);
    expect(summaryRecord().timeRange).toEqual({
      start: '2026-09-08T10:00:00.000Z',
      end: '2026-09-08T11:00:00.000Z',
    });
    expect(client.stdout.getFullOutput()).not.toContain('Searching spans');
  });

  it('filters by span ID and records only redacted option usage', async () => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        'NOT (service.name:vercel.* AND span.kind:1) AND span.id:"span_001"'
      );
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search', '--span-id', 'span_001');
    expect(await traces(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:search', value: 'search' },
      { key: 'option:span-id', value: '[REDACTED]' },
    ]);
  });

  describe('deployment filter', () => {
    const filter =
      'NOT (service.name:vercel.* AND span.kind:1) AND deployment.id:"dpl_001"';
    const deprecated = '--deployment-id is deprecated. Use --deployment.';

    beforeEach(() => {
      client.scenario.post('/v1/observability/events', (req, res) => {
        expect(req.body.filter).toBe(filter);
        res.json(respondWithSpans());
      });
    });

    it('filters by --deployment without a warning', async () => {
      client.setArgv('traces', 'search', '--deployment', 'dpl_001');

      expect(await traces(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:search', value: 'search' },
        { key: 'option:deployment', value: '[REDACTED]' },
      ]);
    });

    it('still accepts the deprecated --deployment-id with a warning', async () => {
      client.setArgv('traces', 'search', '--deployment-id', 'dpl_001');

      expect(await traces(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(`! ${deprecated}`);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:search', value: 'search' },
        { key: 'option:deployment-id', value: '[REDACTED]' },
      ]);
    });

    it('writes the --deployment-id warning as a JSON Lines warning', async () => {
      client.setArgv(
        'traces',
        'search',
        '--deployment-id',
        'dpl_001',
        '--json'
      );

      expect(await traces(client)).toBe(0);
      expect(jsonLines()[0]).toEqual({
        type: 'warning',
        reason: 'deprecated',
        message: deprecated,
      });
      expect(spanRecords()).toEqual([toApiSpan(sampleSpan)]);
      expect(summaryRecord().type).toBe('summary');
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('writes no warning line for --deployment with --json', async () => {
      client.setArgv('traces', 'search', '--deployment', 'dpl_001', '--json');

      expect(await traces(client)).toBe(0);
      expect(jsonLines().map(line => line.type)).not.toContain('warning');
      expect(client.stderr.getFullOutput()).toBe('');
    });
  });

  describe.each([
    ['--trace', '--trace-id', 'trace.id', 'trace_001'],
    ['--span', '--span-id', 'span.id', 'span_001'],
  ])('%s filter', (name, oldName, field, value) => {
    const filter = `NOT (service.name:vercel.* AND span.kind:1) AND ${field}:"${value}"`;
    const deprecated = `${oldName} is deprecated. Use ${name}.`;

    beforeEach(() => {
      client.scenario.post('/v1/observability/events', (req, res) => {
        expect(req.body.filter).toBe(filter);
        res.json(respondWithSpans());
      });
    });

    it(`filters by ${name} without a warning`, async () => {
      client.setArgv('traces', 'search', name, value);

      expect(await traces(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:search', value: 'search' },
        { key: `option:${name.slice(2)}`, value: '[REDACTED]' },
      ]);
    });

    it(`still accepts ${oldName}, with one warning`, async () => {
      client.setArgv('traces', 'search', oldName, value);

      expect(await traces(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr.match(/deprecated/g)).toHaveLength(1);
      expect(stderr).toContain(`! ${deprecated}\n`);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:search', value: 'search' },
        { key: `option:${oldName.slice(2)}`, value: '[REDACTED]' },
      ]);
    });

    it(`writes the ${oldName} warning as a JSON Lines warning`, async () => {
      client.setArgv('traces', 'search', oldName, value, '--json');

      expect(await traces(client)).toBe(0);
      expect(jsonLines()[0]).toEqual({
        type: 'warning',
        reason: 'deprecated',
        message: deprecated,
      });
      expect(spanRecords()).toEqual([toApiSpan(sampleSpan)]);
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it(`writes no warning line for ${name} with --json`, async () => {
      client.setArgv('traces', 'search', name, value, '--json');

      expect(await traces(client)).toBe(0);
      expect(jsonLines().map(line => line.type)).not.toContain('warning');
      expect(client.stderr.getFullOutput()).toBe('');
    });
  });

  it('filters root spans and records flag telemetry', async () => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        'NOT (service.name:vercel.* AND span.kind:1) AND span.isRoot:1'
      );
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search', '--root');

    expect(await traces(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:search', value: 'search' },
      { key: 'flag:root', value: 'TRUE' },
    ]);
  });

  it('sends normalized enums and UTC date-only bounds while preserving JSON output', async () => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        'NOT (service.name:vercel.* AND span.kind:1) AND environment:"preview" AND span.status.code:"Ok"'
      );
      expect(req.body.timeRange).toEqual({
        start: '2026-09-07T00:00:00.000Z',
        end: '2026-09-08T00:00:00.000Z',
      });
      res.json(respondWithSpans());
    });
    client.setArgv(
      'traces',
      'search',
      '--environment',
      ' PREVIEW ',
      '--status',
      'oK',
      '--since',
      '2026-09-07',
      '--until',
      '2026-09-08',
      '--json'
    );
    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual([toApiSpan(sampleSpan)]);
  });

  it.each([
    false,
    true,
  ])('keeps the default exclusion outside user OR expressions, JSON: %s', async json => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        'NOT (service.name:vercel.* AND span.kind:1) AND (span.status.code:Error OR span.kind:2)'
      );
      expect(req.body.limit).toBe(100);
      res.json(respondWithSpans());
    });
    client.setArgv(
      'traces',
      'search',
      '--query',
      'span.status.code:Error OR span.kind:2',
      ...(json ? ['--json'] : [])
    );

    expect(await traces(client)).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(sampleSpan.traceId);
  });

  it('applies the default exclusion to JSON searches without user filters', async () => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        'NOT (service.name:vercel.* AND span.kind:1)'
      );
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search', '--json');

    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual([toApiSpan(sampleSpan)]);
  });

  it('passes --kind through the shared query resolver', async () => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        'NOT (service.name:vercel.* AND span.kind:1) AND span.kind:2'
      );
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search', '--kind', 'server', '--json');

    expect(await traces(client)).toBe(0);
    expect(spanRecords()).toEqual([toApiSpan(sampleSpan)]);
  });

  it.each([
    'span.kind:Internal',
    'span.kind:UNKNOWN',
    'span.kind:(1 OR 2)',
    'NOT (span.kind:1 OR span.kind:2)',
    'span.kind=~"INTERNAL"',
    'span.name:"span.kind:SERVER"',
    "spanAttributes/'spanKind':INTERNAL",
    'span.kind:(Internal OR',
  ])('forwards raw query text without local parsing: %s', async query => {
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.filter).toBe(
        `NOT (service.name:vercel.* AND span.kind:1) AND (${query})`
      );
      res.status(400).json({
        error: { code: 'invalid_query', message: 'API filter validation' },
      });
    });
    client.setArgv('traces', 'search', '--query', query);

    expect(await traces(client)).toBe(1);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('API filter validation');
  });

  it.each([
    ['extra'],
    ['--environment', 'staging'],
    ['--limit', '0'],
    ['--since', 'later'],
  ])('rejects invalid arguments before scope resolution: %j', async (...args) => {
    client.setArgv('traces', 'search', ...args);

    expect(await traces(client)).toBe(2);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('records redacted options when rejecting positional arguments', async () => {
    client.setArgv('traces', 'search', 'extra', '--service', 'secret-service');

    expect(await traces(client)).toBe(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:search', value: 'search' },
      { key: 'option:service', value: '[REDACTED]' },
    ]);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it.each([
    { args: ['--unknown'] },
    { args: ['--columns'] },
    { args: ['--columns', ''] },
    { args: ['--columns', 'unknown'] },
    { args: ['--columns', 'name,name'] },
    { args: ['--columns', 'name', '--json'] },
    { args: ['--query'] },
    { args: ['--span', 'span_1', '--span-id', 'span_1'] },
    { args: ['--trace', 'trace_1', '--trace-id', 'trace_1'] },
    { args: ['--span', ''] },
    { args: ['--deployment', 'dpl_001', '--deployment-id', 'dpl_002'] },
    { args: ['--deployment', ''] },
    { args: ['--span-kind', 'server'] },
    { args: ['--kind', 'UNKNOWN'] },
    { args: ['--kind'] },
    { args: ['--span-id'] },
    { args: ['--span-id', ''] },
    { args: ['--scope'] },
    { args: ['--since', ''] },
    { args: ['--since', '100'] },
    { args: ['--until', '100'] },
    { args: ['--since', '2026-02-29'] },
    { args: ['--until', '999999999999999d'] },
  ])('emits structured validation errors for $args', async ({ args }) => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    client.setArgv('traces', 'search', '--non-interactive', ...args);
    // What `vercel` sets for `--non-interactive` before the command runs.
    client.nonInteractive = true;

    await expect(traces(client)).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledExactlyOnceWith(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.any(String),
    });
    if (args.includes('100')) {
      expect(JSON.parse(client.stdout.getFullOutput()).message).toContain(
        'duration with units such as 100ms or 30m'
      );
    }
    expect(client.stderr.getFullOutput()).toBe('');
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  describe('scope errors for traces config ls', () => {
    const command = ['config', 'ls'];

    it('emits a link action preserving safe global flags', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      client.setArgv(
        'traces',
        ...command,
        '--non-interactive',
        '--cwd',
        '/tmp/my-project',
        '--token',
        'secret-token'
      );

      await expect(traces(client)).rejects.toThrow('exit');
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'not_linked',
        message: expect.stringContaining('No linked project found'),
        next: [
          {
            command: expect.stringContaining('vercel link'),
            when: expect.any(String),
          },
        ],
      });
      expect(payload.next[0].command).toContain('--cwd /tmp/my-project');
      expect(payload.next[0].command).toContain('--non-interactive');
      expect(client.stdout.getFullOutput()).not.toContain('secret-token');
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('emits a structured error for a conflicting team', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      client.nonInteractive = true;
      client.setArgv('traces', ...command, '--scope', 'other-team');

      await expect(traces(client)).rejects.toThrow('exit');
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(2);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        status: 'error',
        reason: 'invalid_arguments',
        message: expect.stringContaining('Pass --project <name>'),
      });
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('preserves upstream project-not-found JSON without a second payload', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
        orgId: 'team_dummy',
        org: null,
        project: null,
      });
      client.scenario.get('/v2/teams/team_dummy', (_req, res) => {
        res.json({ id: 'team_dummy', slug: 'my-team' });
      });
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      client.nonInteractive = true;
      client.setArgv('traces', ...command, '--project', 'missing-project');

      await expect(traces(client)).rejects.toThrow('exit');
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'project_not_found',
        message: expect.stringContaining('missing-project'),
      });
    });
  });

  it('requires a team when search has no project or team context', async () => {
    vi.mocked(linkModule.getLinkFromDir).mockResolvedValue(null);
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    client.nonInteractive = true;
    client.setArgv('traces', 'search');

    await expect(traces(client)).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledExactlyOnceWith(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('A team scope is required'),
    });
  });

  it('searches an explicitly scoped team without project context', async () => {
    client.config.currentTeam = 'team_other';
    useTeam('team_other');
    client.scenario.post('/v1/observability/events', (req, res) => {
      expect(req.body.scope).toEqual({
        ownerId: 'team_other',
      });
      res.json(respondWithSpans());
    });
    client.setArgv('traces', 'search', '--scope', 'other-team', '--json');

    expect(await traces(client)).toBe(0);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  describe.each([
    false,
    true,
  ])('repository team resolution, non-interactive=%s', nonInteractive => {
    beforeEach(async () => {
      client.nonInteractive = nonInteractive;
      client.config.currentTeam = 'team_other';
      useTeam('team_other');
      vi.mocked(linkModule.getLinkFromDir).mockResolvedValue(null);
      await outputJSON(join(client.cwd, '.vercel', 'repo.json'), {
        remoteName: 'origin',
        orgId: 'team_legacy',
        projects: [
          {
            id: 'prj_a',
            name: 'app-a',
            directory: 'apps/a',
            orgId: 'team_dummy',
          },
          {
            id: 'prj_b',
            name: 'app-b',
            directory: 'apps/b',
            orgId: 'team_dummy',
          },
        ],
      });
    });

    it('searches the linked team at the repo root without choosing a project', async () => {
      const select = vi.spyOn(client.input, 'select');
      client.scenario.post('/v1/observability/events', (req, res) => {
        expect(req.body.scope).toEqual({ ownerId: 'team_dummy' });
        expect(req.query.teamId).toBe('team_dummy');
        res.json(respondWithSpans());
      });
      client.setArgv('traces', 'search', '--json');

      expect(await traces(client)).toBe(0);
      expect(select).not.toHaveBeenCalled();
      expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    });

    it('uses an explicit team instead of the repo team', async () => {
      client.scenario.post('/v1/observability/events', (req, res) => {
        expect(req.body.scope).toEqual({ ownerId: 'team_other' });
        res.json(respondWithSpans());
      });
      client.setArgv('traces', 'search', '--scope', 'other-team', '--json');

      expect(await traces(client)).toBe(0);
      expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    });

    it('requires an explicit team at a cross-team repo root before querying', async () => {
      await outputJSON(join(client.cwd, '.vercel', 'repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: 'prj_a',
            name: 'app-a',
            directory: 'apps/a',
            orgId: 'team_dummy',
          },
          {
            id: 'prj_b',
            name: 'app-b',
            directory: 'apps/b',
            orgId: 'team_other',
          },
        ],
      });
      const fetch = vi.spyOn(client, 'fetch');
      const select = vi.spyOn(client.input, 'select');
      client.setArgv('traces', 'search');
      if (nonInteractive) {
        vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        await expect(traces(client)).rejects.toThrow('exit');
        expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
          reason: 'invalid_arguments',
          message: expect.stringContaining('Pass `--scope <team>`'),
        });
      } else {
        expect(await traces(client)).toBe(2);
        expect(client.stderr.getFullOutput()).toContain(
          'Pass `--scope <team>`'
        );
      }
      expect(
        fetch.mock.calls.some(([path]) => String(path).includes('/events'))
      ).toBe(false);
      expect(select).not.toHaveBeenCalled();
    });

    it('resolves a project directory within a cross-team repo', async () => {
      await outputJSON(join(client.cwd, '.vercel', 'repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: 'prj_a',
            name: 'app-a',
            directory: 'apps/a',
            orgId: 'team_dummy',
          },
          {
            id: 'prj_b',
            name: 'app-b',
            directory: 'apps/b',
            orgId: 'team_other',
          },
        ],
      });
      const projectDirectory = join(client.cwd, 'apps', 'a');
      await ensureDir(projectDirectory);
      client.cwd = projectDirectory;
      client.scenario.post('/v1/observability/events', (req, res) => {
        expect(req.body.scope).toEqual({ ownerId: 'team_dummy' });
        res.json(respondWithSpans());
      });
      client.setArgv('traces', 'search', '--json');

      expect(await traces(client)).toBe(0);
    });
  });

  it('prints the empty result and pagination notice', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans([], true));
    });
    client.setArgv('traces', 'search');

    expect(await traces(client)).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(
      'No spans found for this period.\n'
    );
    expect(client.stderr.getFullOutput()).toContain('More spans matched.');
  });

  it('surfaces API errors without retrying', async () => {
    let attempts = 0;
    client.scenario.post('/v1/observability/events', (_req, res) => {
      attempts++;
      res.status(400).json({
        error: { code: 'invalid_query', message: 'Unsupported filter field' },
      });
    });
    client.setArgv('traces', 'search', '--query', 'unknown:"value"');

    expect(await traces(client)).toBe(1);
    expect(attempts).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Unsupported filter field');
  });

  it.each([
    false,
    true,
  ])('includes API issue paths and messages, non-interactive: %s', async nonInteractive => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'Invalid events request',
          issues: [
            { path: 'filter', message: 'Unsupported filter field: unknown' },
            { path: 'select.0', message: 'Unsupported selected field' },
          ],
        },
      });
    });
    client.nonInteractive = nonInteractive;
    client.setArgv('traces', 'search', '--query', 'unknown:"value"', '--json');
    const message =
      'Invalid events request: filter: Unsupported filter field: unknown, select.0: Unsupported selected field. Filter error positions refer to the generated filter, including CLI-added clauses.';

    if (nonInteractive) {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      await expect(traces(client)).rejects.toThrow('exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        status: 'error',
        reason: 'api_error',
        message,
      });
    } else {
      expect(await traces(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(message);
      expect(client.stdout.getFullOutput()).toBe('');
    }
  });

  it.each([
    { issues: undefined },
    { issues: [] },
    { issues: null },
    { issues: 'invalid' },
    { issues: [{ path: 'filter' }] },
  ])('keeps the API message when issues are missing, empty, or malformed: $issues', async ({
    issues,
  }) => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.status(400).json({
        error: { message: 'Invalid events request', issues },
      });
    });
    client.setArgv('traces', 'search');

    expect(await traces(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid events request (400)'
    );
  });

  it.each([
    undefined,
    '60',
  ])('does not retry 429 with Retry-After %s', async retryAfter => {
    let attempts = 0;
    client.scenario.post('/v1/observability/events', (_req, res) => {
      attempts++;
      if (retryAfter !== undefined) res.set('Retry-After', retryAfter);
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many requests' },
      });
    });
    client.setArgv('traces', 'search');

    expect(await traces(client)).toBe(1);
    expect(attempts).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Too many requests');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it.each([
    ['60', 60_000],
    ['Tue, 08 Sep 2026 12:01:00 GMT', 60_000],
    [undefined, undefined],
    ['invalid', undefined],
  ] as const)('preserves 429 recovery in agent output with Retry-After %s', async (retryAfter, retryAfterMs) => {
    let attempts = 0;
    client.scenario.post('/v1/observability/events', (_req, res) => {
      attempts++;
      if (retryAfter !== undefined) res.set('Retry-After', retryAfter);
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many requests' },
      });
    });
    client.nonInteractive = true;
    client.setArgv('traces', 'search');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await expect(traces(client)).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(attempts).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'error',
      reason: 'rate_limited',
      message: 'Too many requests',
      retryable: true,
      hint: retryAfterMs
        ? 'Wait at least 60 seconds before trying again.'
        : 'The request limit was reached. Wait before trying again; no retry time was provided.',
      ...(retryAfterMs !== undefined && { retryAfterMs }),
    });
    expect(client.stderr.getFullOutput()).not.toContain('Too many requests');
  });

  it('preserves non-retryable rate limits in agent output', () => {
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const err = Object.assign(new Error('Too many requests'), {
      status: 429,
      retryAfterMs: 'never' as const,
    });

    expect(() => handleTracingApiError(client, err)).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'error',
      reason: 'rate_limited',
      message: 'Too many requests',
      retryable: false,
      hint: 'This request cannot be retried with the current limit. Ask a team owner to review the limit.',
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('rejects malformed responses', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json({ events: [{}], pagination: {}, meta: {} });
    });
    client.setArgv('traces', 'search');

    expect(await traces(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'invalid span search response'
    );
  });

  it('redacts search option telemetry', async () => {
    client.scenario.post('/v1/observability/events', (_req, res) => {
      res.json(respondWithSpans());
    });
    client.setArgv(
      'traces',
      'search',
      '--project',
      'secret-project',
      '--service',
      'secret-service',
      '--name',
      'secret-span-name',
      '--deployment',
      'secret-deployment',
      '--kind',
      'internal',
      '--root',
      '--query',
      'secret-query',
      '--since',
      '2h',
      '--limit',
      '10',
      '--json'
    );

    expect(await traces(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:search', value: 'search' },
      { key: 'flag:json', value: 'TRUE' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'option:service', value: '[REDACTED]' },
      { key: 'option:name', value: '[REDACTED]' },
      { key: 'option:kind', value: '[REDACTED]' },
      { key: 'option:deployment', value: '[REDACTED]' },
      { key: 'flag:root', value: 'TRUE' },
      { key: 'option:since', value: '[REDACTED]' },
      { key: 'option:limit', value: '[REDACTED]' },
      { key: 'option:query', value: '[REDACTED]' },
    ]);
  });

  describe('pagination', () => {
    const path = '/v1/observability/events';
    const exclusion = 'NOT (service.name:vercel.* AND span.kind:1)';
    const window = {
      start: '2026-09-08T10:00:00.000Z',
      end: '2026-09-08T11:00:00.000Z',
    };

    function token(overrides: Partial<EventsContinuation> = {}): string {
      return encodeContinuation({
        event: 'vercel.span',
        ownerId: 'team_dummy',
        projectIds: ['prj_test'],
        timeRange: window,
        filter: `${exclusion} AND span.status.code:"Error"`,
        order: 'desc',
        cursor: 'api_cursor_1',
        ...overrides,
      });
    }

    function useEvents(...responses: object[]) {
      const bodies: Record<string, unknown>[] = [];
      client.scenario.post(path, (req, res) => {
        bodies.push(req.body);
        res.json(responses[Math.min(bodies.length, responses.length) - 1]);
      });
      return bodies;
    }

    /** Pulls the `--next` token out of a printed `Next page:` command. */
    function printedToken(text: string): string {
      const match = stripAnsi(text).match(/--next ([A-Za-z0-9_-]+)/);
      expect(match).not.toBeNull();
      return match![1];
    }

    it('prints a Next page command that keeps the window and filters', async () => {
      useEvents(respondWithSpans([sampleSpan], true));
      client.setArgv(
        'traces',
        'search',
        '--status',
        'error',
        '--since',
        window.start,
        '--until',
        window.end,
        '--limit',
        '1'
      );

      expect(await traces(client)).toBe(0);
      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain('More spans matched.');
      expect(stderr).toContain('Next page:');
      expect(stderr).toContain('--limit 1');
      expect(stderr).not.toContain('Narrow the query');
      expect(client.stdout.getFullOutput()).not.toContain('Next page');
      expect(decodeContinuation(printedToken(stderr))).toEqual({
        event: 'vercel.span',
        ownerId: 'team_dummy',
        timeRange: window,
        filter: `${exclusion} AND span.status.code:"Error"`,
        order: 'desc',
        cursor: 'cursor_001',
      });
    });

    it('keeps --columns in the Next page command', async () => {
      useEvents(respondWithSpans([sampleSpan], true));
      client.setArgv(
        'traces',
        'search',
        '--limit',
        '1',
        '--columns',
        'span.name,trace.id'
      );

      expect(await traces(client)).toBe(0);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        "--columns 'span.name,trace.id'"
      );
    });

    it('keeps table mode in the Next page command after --non-interactive=false', async () => {
      useEvents(respondWithSpans([sampleSpan], true));
      // An agent environment where the user turned non-interactive mode off.
      client.nonInteractive = false;
      client.setArgv(
        'traces',
        'search',
        '--non-interactive=false',
        '--limit',
        '1',
        '--columns',
        'span.name'
      );

      expect(await traces(client)).toBe(0);
      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain('--non-interactive=false');
      expect(stderr).toContain('--columns span.name');
      expect(stderr).not.toContain('--json');
    });

    it('puts the token in the JSON summary and keeps stderr empty', async () => {
      useEvents(respondWithSpans([sampleSpan], true));
      client.nonInteractive = true;
      client.setArgv('traces', 'search', '--limit', '1');

      expect(await traces(client)).toBe(0);
      const summary = summaryRecord();
      expect(summary).toMatchObject({
        recordsReturned: 1,
        pagination: { hasMore: true },
      });
      const next = (summary.pagination as { next: string }).next;
      expect(decodeContinuation(next)).toMatchObject({
        ownerId: 'team_dummy',
        cursor: 'cursor_001',
      });
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('continues from a token with its cursor, window, filter, and project', async () => {
      const bodies = useEvents(respondWithSpans());
      // Relative times would resolve differently now; the token must win.
      vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000);
      client.setArgv('traces', 'search', '--next', token(), '--json');

      expect(await traces(client)).toBe(0);
      expect(bodies).toEqual([
        {
          event: 'vercel.span',
          scope: { ownerId: 'team_dummy', projectIds: ['prj_test'] },
          timeRange: window,
          filter: `${exclusion} AND span.status.code:"Error"`,
          select: ['span', 'resource'],
          order: 'desc',
          limit: 100,
          cursor: 'api_cursor_1',
        },
      ]);
      expect(summaryRecord()).toMatchObject({
        recordsReturned: 1,
        timeRange: window,
        pagination: { hasMore: false, next: null },
      });
    });

    it('fetches pages until --limit spans are returned', async () => {
      const span = (id: string) => toApiSpan({ ...sampleSpan, spanId: id });
      const bodies = useEvents(
        {
          events: [span('a'), span('b')],
          pagination: { hasMore: true, nextCursor: 'cursor_a' },
          meta: {},
        },
        {
          events: [span('c')],
          pagination: { hasMore: true, nextCursor: 'cursor_b' },
          meta: {},
        }
      );
      client.setArgv('traces', 'search', '--limit', '3', '--json');

      expect(await traces(client)).toBe(0);
      expect(bodies.map(body => [body.limit, body.cursor])).toEqual([
        [3, undefined],
        [1, 'cursor_a'],
      ]);
      expect(spanRecords()).toHaveLength(3);
      const summary = summaryRecord();
      expect(summary.recordsReturned).toBe(3);
      expect(
        decodeContinuation((summary.pagination as { next: string }).next)
          ?.cursor
      ).toBe('cursor_b');
    });

    it('lets --limit change with --next', async () => {
      const bodies = useEvents(respondWithSpans());
      client.setArgv('traces', 'search', '--next', token(), '--limit', '7');

      expect(await traces(client)).toBe(0);
      expect(bodies[0]).toMatchObject({ limit: 7, cursor: 'api_cursor_1' });
    });

    it.each([
      ['--project', 'traces-project'],
      ['--environment', 'production'],
      ['--service', 'checkout-api'],
      ['--name', 'GET /'],
      ['--kind', 'server'],
      ['--status', 'error'],
      ['--deployment', 'dpl_001'],
      ['--deployment-id', 'dpl_001'],
      ['--request-id', 'req_001'],
      ['--trace-id', 'trace_001'],
      ['--span-id', 'span_001'],
      ['--since', '1h'],
      ['--until', '10m'],
      ['--query', 'span.duration > 2000'],
      ['--root'],
    ])('rejects %s with --next before any request', async (...flag) => {
      const bodies = useEvents(respondWithSpans());
      client.setArgv('traces', 'search', '--next', token(), ...flag);

      expect(await traces(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        `\`${flag[0]}\` can't be combined with \`--next\``
      );
      expect(bodies).toHaveLength(0);
    });

    it.each([
      ['garbage', 'not a cursor!'],
      ['undecodable', 'bm90LWpzb24'],
      ['a logs cursor', token({ event: 'vercel.log' })],
      ['an ascending cursor', token({ order: 'asc' })],
      ['several projects', token({ projectIds: ['prj_a', 'prj_b'] })],
      [
        'a non-canonical window',
        token({ timeRange: { start: '2026-09-08', end: window.end } }),
      ],
      [
        'a reversed window',
        token({ timeRange: { start: window.end, end: window.start } }),
      ],
    ])('rejects %s as an invalid cursor', async (_label, value) => {
      const bodies = useEvents(respondWithSpans());
      client.setArgv('traces', 'search', '--next', value);

      expect(await traces(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        '`--next` is not a valid cursor'
      );
      expect(bodies).toHaveLength(0);
    });

    it('rejects an empty --next', async () => {
      const bodies = useEvents(respondWithSpans());
      client.setArgv('traces', 'search', '--next', ' ');

      expect(await traces(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        '`--next` must not be empty.'
      );
      expect(bodies).toHaveLength(0);
    });

    it('reports an invalid cursor in non-interactive mode', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      client.nonInteractive = true;
      client.setArgv('traces', 'search', '--next', 'not a cursor!');

      await expect(traces(client)).rejects.toThrow('exit');
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(2);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
      });
    });

    it('rejects a --scope for a different team than the cursor', async () => {
      const bodies = useEvents(respondWithSpans());
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'traces',
        'search',
        '--scope',
        'other-team',
        '--next',
        token({ ownerId: 'team_other' })
      );

      expect(await traces(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        'belongs to a different team than `--scope`'
      );
      expect(bodies).toHaveLength(0);
    });

    it('accepts a --scope that matches the cursor team', async () => {
      const bodies = useEvents(respondWithSpans());
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'traces',
        'search',
        '--scope',
        'my-team',
        '--next',
        token(),
        '--json'
      );

      expect(await traces(client)).toBe(0);
      expect(bodies).toHaveLength(1);
    });

    it('explains a cursor the API rejects', async () => {
      client.scenario.post(path, (_req, res) => {
        res.status(400).json({ error: { message: 'Invalid events request' } });
      });
      client.setArgv('traces', 'search', '--next', token());

      expect(await traces(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'The cursor may have expired. Run the search again without --next.'
      );
    });

    it('puts API issue details before the expired-cursor hint', async () => {
      client.scenario.post(path, (_req, res) => {
        res.status(400).json({
          error: {
            message: 'Invalid events request',
            issues: [{ path: 'cursor', message: 'expired' }],
          },
        });
      });
      client.setArgv('traces', 'search', '--next', token());

      expect(await traces(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Invalid events request: cursor: expired. The cursor may have expired. Run the search again without --next. (400)'
      );
    });

    it('offers no token when more matched but the API gave no cursor', async () => {
      useEvents({
        events: [toApiSpan(sampleSpan)],
        pagination: { hasMore: true, nextCursor: null },
        meta: {},
      });
      client.setArgv('traces', 'search');

      expect(await traces(client)).toBe(0);
      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain('More spans matched.');
      expect(stderr).not.toContain('Next page');
      expect(stderr).toContain(
        'Narrow the query or increase --limit to see the rest.'
      );
    });

    it('reports hasMore without a token in JSON when the API gave no cursor', async () => {
      useEvents({
        events: [toApiSpan(sampleSpan)],
        pagination: { hasMore: true, nextCursor: null },
        meta: {},
      });
      client.setArgv('traces', 'search', '--json');

      expect(await traces(client)).toBe(0);
      expect(summaryRecord().pagination).toEqual({
        hasMore: true,
        next: null,
      });
    });

    it('passes excluded intervals through to the summary', async () => {
      const interval = {
        start: '2026-09-08T11:10:00.000Z',
        end: '2026-09-08T11:20:00.000Z',
      };
      useEvents({
        ...respondWithSpans(),
        meta: { excludedIntervals: [interval] },
      });
      client.setArgv('traces', 'search', '--json');

      expect(await traces(client)).toBe(0);
      expect(summaryRecord().excludedIntervals).toEqual([interval]);
    });

    it('warns in table mode when part of the window is excluded', async () => {
      useEvents({
        ...respondWithSpans(),
        meta: {
          excludedIntervals: [
            {
              start: '2026-09-08T11:10:00.000Z',
              end: '2026-09-08T11:20:00.000Z',
            },
          ],
        },
      });
      client.setArgv('traces', 'search');

      expect(await traces(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Results omit part of this window'
      );
    });

    /** Answers with 500 spans after one 413, then fails the next page. */
    function failSecondPage() {
      const firstPage = Array.from({ length: 500 }, (_, index) =>
        toApiSpan({ ...sampleSpan, spanId: `span_${index}` })
      );
      let calls = 0;
      client.scenario.post(path, (req, res) => {
        calls++;
        if (calls === 1) {
          res.status(413).json({
            error: { code: 'result_too_large', message: 'Result too large' },
          });
        } else if (calls === 2) {
          expect(req.body.limit).toBe(500);
          res.json({
            events: firstPage,
            pagination: { hasMore: true, nextCursor: 'cursor_page_2' },
            meta: {},
          });
        } else {
          res.status(500).json({ error: { message: 'Internal error' } });
        }
      });
    }

    function expectFailureDocument(stderr: string) {
      const lines = stderr.split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      const document = JSON.parse(lines[0]);
      expect(document).toMatchObject({
        status: 'error',
        reason: 'api_error',
        data: {
          recordsReturned: 500,
          outputIncomplete: true,
          pagination: { hasMore: true },
          excludedIntervals: [],
        },
        next: [
          {
            command: expect.stringContaining('--limit 1000'),
            when: 'Retry the failed page',
          },
        ],
      });
      expect(decodeContinuation(document.data.pagination.next)?.cursor).toBe(
        'cursor_page_2'
      );
      return document;
    }

    it('keeps stdout as JSON Lines when a later page fails', async () => {
      failSecondPage();
      client.setArgv('traces', 'search', '--limit', '1000', '--json');

      expect(await traces(client)).toBe(1);
      expect(spanRecords()).toHaveLength(500);
      expect(jsonLines().some(line => line.type === 'summary')).toBe(false);
      const document = expectFailureDocument(client.stderr.getFullOutput());
      expect(document.next[0].command).toContain('--json');
    });

    it('keeps stdout as JSON Lines when a later page fails in non-interactive mode', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      failSecondPage();
      client.nonInteractive = true;
      client.setArgv('traces', 'search', '--limit', '1000');

      expect(await traces(client)).toBe(1);
      expect(exitSpy).not.toHaveBeenCalled();
      // Every stdout line parses on its own.
      expect(jsonLines()).toHaveLength(500);
      expect(spanRecords()).toHaveLength(500);
      const document = expectFailureDocument(client.stderr.getFullOutput());
      // JSON mode came from agent detection, so the retry asks for it
      // explicitly and doesn't add an interaction flag.
      expect(document.next[0].command).toContain('--json');
      expect(document.next[0].command).not.toContain('--non-interactive');
    });

    it('keeps an explicit --non-interactive in the retry command', async () => {
      failSecondPage();
      client.nonInteractive = true;
      client.setArgv(
        'traces',
        'search',
        '--non-interactive',
        '--limit',
        '1000'
      );

      expect(await traces(client)).toBe(1);
      const document = expectFailureDocument(client.stderr.getFullOutput());
      expect(document.next[0].command).toContain('--json');
      expect(document.next[0].command).toMatch(/--non-interactive(\s|$)/);
    });

    it('prints received spans and a retry command when a later page fails in table mode', async () => {
      failSecondPage();
      client.setArgv('traces', 'search', '--limit', '1000');

      expect(await traces(client)).toBe(1);
      expect(client.stdout.getFullOutput().trim().split('\n')).toHaveLength(
        501
      );
      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain(
        'Output is incomplete: 500 spans were printed before the failure.'
      );
      expect(stderr).toContain('Retry the failed page:');
      expect(stderr).not.toContain('--json');
      expect(decodeContinuation(printedToken(stderr))?.cursor).toBe(
        'cursor_page_2'
      );
    });

    it('offers no retry when a later page has a record too large to return', async () => {
      const firstPage = Array.from({ length: 500 }, (_, index) =>
        toApiSpan({ ...sampleSpan, spanId: `span_${index}` })
      );
      let calls = 0;
      client.scenario.post(path, (req, res) => {
        calls++;
        if (calls === 2) {
          res.json({
            events: firstPage,
            pagination: { hasMore: true, nextCursor: 'cursor_page_2' },
            meta: {},
          });
        } else {
          res.status(413).json({
            error: { code: 'result_too_large', message: 'Result too large' },
          });
        }
      });
      client.setArgv('traces', 'search', '--limit', '1000', '--json');

      expect(await traces(client)).toBe(1);
      expect(spanRecords()).toHaveLength(500);
      const lines = client.stderr.getFullOutput().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      const document = JSON.parse(lines[0]);
      expect(document.message).toContain(
        'A single record exceeds the API response size limit'
      );
      expect(document.data).toMatchObject({
        recordsReturned: 500,
        outputIncomplete: true,
        pagination: { hasMore: true, next: null },
      });
      expect(document.next).toBeUndefined();
    });

    it('records --next as a redacted option', async () => {
      useEvents(respondWithSpans());
      client.setArgv('traces', 'search', '--next', token(), '--json');

      expect(await traces(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:search', value: 'search' },
        { key: 'flag:json', value: 'TRUE' },
        { key: 'option:next', value: '[REDACTED]' },
      ]);
    });
  });
});
