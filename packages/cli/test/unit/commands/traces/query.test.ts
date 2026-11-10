import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import {
  handleSpanQueryError,
  resolveSpanQuery,
  spanEventsRequest,
  type SpanQuery,
  type SpanQueryFlags,
} from '../../../../src/commands/traces/query';
import { fetchEventPages } from '../../../../src/util/observability/events';
import { resolveConfigScope } from '../../../../src/commands/traces/config/scope';
import { getLinkFromDir } from '../../../../src/util/projects/link';
import { getRepoLink } from '../../../../src/util/link/repo';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { spanQueryOptions } from '../../../../src/commands/traces/options';
import { searchSubcommand } from '../../../../src/commands/traces/command';
import { TracesTelemetryClient } from '../../../../src/util/telemetry/commands/traces';

vi.mock('../../../../src/commands/traces/config/scope');
vi.mock('../../../../src/util/projects/link', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../../src/util/projects/link')
  >()),
  getLinkFromDir: vi.fn(),
}));
vi.mock('../../../../src/util/link/repo', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../src/util/link/repo')>()),
  getRepoLink: vi.fn(),
}));

const now = Date.parse('2026-09-08T12:00:00.000Z');
const exclusion = 'NOT (service.name:vercel.* AND span.kind:1)';
const telemetry = new TracesTelemetryClient({
  opts: { store: client.telemetryEventStore },
});

describe('shared span queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    vi.mocked(resolveConfigScope).mockResolvedValue({
      teamId: 'team_dummy',
      projectId: 'prj_test',
      projectName: 'traces-project',
    });
    useUser();
    useTeam('team_dummy');
    vi.mocked(getRepoLink).mockResolvedValue(undefined);
    vi.mocked(getLinkFromDir).mockResolvedValue({
      orgId: 'team_dummy',
      projectId: 'prj_test',
    });
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves defaults without sending a query', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(await resolveSpanQuery(client, {}, telemetry)).toEqual({
      scope: { ownerId: 'team_dummy' },
      timeRange: {
        start: '2026-09-08T11:00:00.000Z',
        end: '2026-09-08T12:00:00.000Z',
      },
      filter: exclusion,
      limit: 100,
    });
    expect(getLinkFromDir).toHaveBeenCalledOnce();
    expect(resolveConfigScope).not.toHaveBeenCalled();
    expect(
      fetch.mock.calls.some(([path]) => String(path).includes('/events'))
    ).toBe(false);
  });

  it('combines escaped direct filters and grouped raw KQL without mutating flags', async () => {
    const flags = Object.freeze({
      '--project': 'my-project',
      '--environment': 'production',
      '--service': ' checkout"api ',
      '--name': 'payment',
      '--kind': 'server',
      '--status': 'error',
      '--deployment-id': 'dpl_001',
      '--request-id': 'req_001',
      '--trace-id': 'trace_001',
      '--root': true,
      '--query': ' span.status.code:Error OR span.kind:2 ',
      '--limit': 12,
    });
    expect(await resolveSpanQuery(client, flags, telemetry)).toMatchObject({
      scope: { ownerId: 'team_dummy', projectIds: ['prj_test'] },
      filter:
        exclusion +
        ' AND (span.status.code:Error OR span.kind:2) AND span.kind:2 AND span.isRoot:1 AND environment:"production" AND service.name:"checkout\\"api" AND span.name:"payment" AND span.status.code:"Error" AND deployment.id:"dpl_001" AND request.id:"req_001" AND trace.id:"trace_001"',
      limit: 12,
    });
    expect(resolveConfigScope).toHaveBeenCalledExactlyOnceWith(client, {
      project: 'my-project',
    });
    expect(getLinkFromDir).not.toHaveBeenCalled();
  });

  it('uses the selected team when no project is linked', async () => {
    client.config.currentTeam = 'team_selected';
    useTeam('team_selected');
    vi.mocked(getLinkFromDir).mockResolvedValue(null);

    expect(await resolveSpanQuery(client, {}, telemetry)).toEqual({
      scope: { ownerId: 'team_selected' },
      timeRange: {
        start: '2026-09-08T11:00:00.000Z',
        end: '2026-09-08T12:00:00.000Z',
      },
      filter: exclusion,
      limit: 100,
    });
  });

  it('uses an explicit team scope instead of the linked project team', async () => {
    client.config.currentTeam = 'team_selected';
    useTeam('team_selected');
    client.setArgv('traces', 'search', '--scope', 'selected-team');

    expect(await resolveSpanQuery(client, {}, telemetry)).toEqual({
      scope: { ownerId: 'team_selected' },
      timeRange: {
        start: '2026-09-08T11:00:00.000Z',
        end: '2026-09-08T12:00:00.000Z',
      },
      filter: exclusion,
      limit: 100,
    });
    expect(resolveConfigScope).not.toHaveBeenCalled();
  });

  it('requires a team when no project or team can be resolved', async () => {
    vi.mocked(getLinkFromDir).mockResolvedValue(null);

    expect(await resolveSpanQuery(client, {}, telemetry)).toEqual({
      exitCode: 2,
    });
    expect(client.stderr.getFullOutput()).toContain(
      'A team scope is required.'
    );
  });

  it('filters root spans and records flag telemetry', async () => {
    expect(
      await resolveSpanQuery(client, { '--root': true }, telemetry)
    ).toMatchObject({ filter: exclusion + ' AND span.isRoot:1' });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:root', value: 'TRUE' },
    ]);
  });

  it.each([
    ['error', 'Error'],
    ['ok', 'Ok'],
    ['unset', 'Unset'],
    [' ERROR ', 'Error'],
    ['Ok', 'Ok'],
    [' UnSeT ', 'Unset'],
  ])('maps status %s to %s', async (status, expected) => {
    expect(
      await resolveSpanQuery(client, { '--status': status }, telemetry)
    ).toMatchObject({
      filter: exclusion + ' AND span.status.code:"' + expected + '"',
    });
  });

  it.each([
    'PRODUCTION',
    ' Preview ',
  ])('normalizes environment %s without changing other filters', async environment => {
    const flags = Object.freeze({
      '--environment': environment,
      '--service': 'CheckoutAPI',
      '--name': 'GET /Checkout',
      '--request-id': 'Req_ABC',
      '--trace-id': 'Trace_ABC',
      '--deployment-id': 'Dpl_ABC',
      '--query': 'span.name:"GET /Checkout"',
    });
    expect(await resolveSpanQuery(client, flags, telemetry)).toMatchObject({
      filter:
        exclusion +
        ' AND (span.name:"GET /Checkout") AND environment:"' +
        environment.trim().toLowerCase() +
        '" AND service.name:"CheckoutAPI" AND span.name:"GET /Checkout" AND deployment.id:"Dpl_ABC" AND request.id:"Req_ABC" AND trace.id:"Trace_ABC"',
    });
  });

  it('trims and escapes span IDs without changing case or supplied flags', async () => {
    const spanId = ' Span"\\ABC ';
    const flags = Object.freeze({
      '--span-id': spanId,
      '--trace-id': 'trace_001',
    });
    expect(await resolveSpanQuery(client, flags, telemetry)).toMatchObject({
      filter:
        exclusion +
        ' AND trace.id:"trace_001" AND span.id:' +
        JSON.stringify(spanId.trim()),
    });
    expect(flags['--span-id']).toBe(spanId);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:trace-id', value: '[REDACTED]' },
      { key: 'option:span-id', value: '[REDACTED]' },
    ]);
  });

  it.each([
    '',
    '   ',
  ])('rejects empty span IDs before scope resolution: %j', async spanId => {
    expect(
      await resolveSpanQuery(client, { '--span-id': spanId }, telemetry)
    ).toEqual({ exitCode: 2 });
    expect(client.stderr.getFullOutput()).toContain(
      '`--span-id` must not be empty.'
    );
    expect(resolveConfigScope).not.toHaveBeenCalled();
  });

  it('resolves date-only bounds at midnight UTC', async () => {
    expect(
      await resolveSpanQuery(
        client,
        {
          '--since': ' 2026-09-07 ',
          '--until': '2026-09-08',
        },
        telemetry
      )
    ).toMatchObject({
      timeRange: {
        start: '2026-09-07T00:00:00.000Z',
        end: '2026-09-08T00:00:00.000Z',
      },
    });
  });

  it('accepts leap days', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2024-03-01T12:00:00Z'));
    expect(
      await resolveSpanQuery(
        client,
        { '--since': '2024-02-29', '--until': '2024-03-01' },
        telemetry
      )
    ).toMatchObject({
      timeRange: {
        start: '2024-02-29T00:00:00.000Z',
        end: '2024-03-01T00:00:00.000Z',
      },
    });
  });

  it('accepts trimmed durations with units', async () => {
    expect(
      await resolveSpanQuery(
        client,
        { '--since': ' 100ms ', '--until': ' 50ms ' },
        telemetry
      )
    ).toMatchObject({
      timeRange: {
        start: '2026-09-08T11:59:59.900Z',
        end: '2026-09-08T11:59:59.950Z',
      },
    });
  });

  it.each([
    { '--since': '2h', '--until': '1h' },
    {
      '--since': '2026-09-08T12:00:00+02:00',
      '--until': '2026-09-08T13:00:00+02:00',
    },
  ])('resolves both time bounds against one clock: %j', async flags => {
    vi.spyOn(telemetry, 'trackCliOptionProject').mockImplementation(() => {});
    vi.spyOn(telemetry, 'trackCliOptionSince').mockImplementation(() => {});
    vi.spyOn(telemetry, 'trackCliOptionUntil').mockImplementation(() => {});
    expect(
      await resolveSpanQuery(
        client,
        { ...flags, '--project': 'my-project' },
        telemetry
      )
    ).toMatchObject({
      timeRange: {
        start: '2026-09-08T10:00:00.000Z',
        end: '2026-09-08T11:00:00.000Z',
      },
    });
    expect(Date.now).toHaveBeenCalledTimes(1);
  });

  it('accepts the exact 30-day and maximum-limit boundaries', async () => {
    expect(
      await resolveSpanQuery(
        client,
        { '--since': '30d', '--limit': 1000 },
        telemetry
      )
    ).toMatchObject({
      timeRange: {
        start: '2026-08-09T12:00:00.000Z',
        end: '2026-09-08T12:00:00.000Z',
      },
      limit: 1000,
    });
  });

  it('preserves millisecond precision', async () => {
    expect(
      await resolveSpanQuery(
        client,
        {
          '--since': '2026-09-08T10:00:00.123Z',
          '--until': '2026-09-08T11:00:00.456Z',
        },
        telemetry
      )
    ).toMatchObject({
      timeRange: {
        start: '2026-09-08T10:00:00.123Z',
        end: '2026-09-08T11:00:00.456Z',
      },
    });
  });

  it('reports team lookup failures without sending a query', async () => {
    vi.mocked(getLinkFromDir).mockResolvedValue({
      orgId: 'team_unavailable',
      projectId: 'prj_test',
    });
    client.scenario.get('/teams/team_unavailable', (_req, res) => {
      res.status(403).json({ error: { message: 'Team access denied' } });
    });
    expect(await resolveSpanQuery(client, {}, telemetry)).toEqual({
      exitCode: 1,
    });
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toContain('Team access denied');
  });

  it('uses shared option definitions without sharing command-specific output options', () => {
    expect(spanQueryOptions.map(option => option.name)).toEqual([
      'project',
      'environment',
      'service',
      'name',
      'kind',
      'status',
      'deployment',
      'deployment-id',
      'request-id',
      'trace',
      'trace-id',
      'span',
      'span-id',
      'root',
      'since',
      'until',
    ]);
    for (const option of spanQueryOptions) {
      expect(
        searchSubcommand.options.find(item => item.name === option.name)
      ).toBe(option);
    }
  });

  it.each([
    ['UNSPECIFIED', 0],
    ['INTERNAL', 1],
    ['SERVER', 2],
    ['CLIENT', 3],
    ['PRODUCER', 4],
    ['CONSUMER', 5],
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['3', 3],
    ['4', 4],
    ['5', 5],
    ['Internal', 1],
    ['internal', 1],
    ['SPAN_KIND_INTERNAL', 1],
    ['span_kind_server', 2],
    ['  client  ', 3],
  ])('normalizes --kind %s to %s', async (kind, expected) => {
    expect(
      await resolveSpanQuery(client, { '--kind': String(kind) }, telemetry)
    ).toMatchObject({ filter: exclusion + ' AND span.kind:' + expected });
  });

  it.each<[string[], string]>([
    [['--kind', 'UNKNOWN'], 'INTERNAL (1)'],
    [['--kind', '6'], 'CONSUMER (5)'],
    [['--kind', '-1'], '--kind'],
    [['--kind', '1.5'], '--kind'],
    [['--kind', ''], '--kind'],
    [['--kind', '  '], '--kind'],
    [['--kind', 'INTERNAL*'], '--kind'],
    [['--kind', '*'], '--kind'],
    [['--kind', '"1"'], '--kind'],
    [['--environment', 'staging'], '--environment'],
    [['--environment', ''], '--environment'],
    [['--status', 'failed'], '--status'],
    [['--status', ''], '--status'],
    [['--query', ''], '--query'],
    [['--service', ''], '--service'],
    [['--limit', '0'], '--limit'],
    [['--limit', '1001'], '--limit'],
    [['--limit', '1.5'], '--limit'],
    [['--since', 'later'], 'Invalid time format'],
    [['--until', 'later'], 'Invalid time format'],
    [['--since', '100'], 'duration with units'],
    [['--until', '100'], 'duration with units'],
    [['--since', ' 100 '], 'duration with units'],
    [['--until', '1.5'], 'duration with units'],
    [['--since', '.5'], 'duration with units'],
    [['--since', '2026-02-29'], 'Invalid time format'],
    [['--until', '2026-09-31'], 'Invalid time format'],
    [['--since', '2026-9-08'], 'Invalid time format'],
    [['--since', ''], 'Invalid time format'],
    [['--until', ''], 'Invalid time format'],
    [['--since', '   '], 'Invalid time format'],
    [['--until', '   '], 'Invalid time format'],
    [['--since', '999999999999999d'], 'Invalid time format'],
    [['--until', '999999999999999d'], 'Invalid time format'],
    [['--since', '1'.repeat(101)], 'Invalid time format'],
    [['--until', '1'.repeat(101)], 'Invalid time format'],
    [['--since', '2026-02-31T00:00:00Z'], 'Invalid time format'],
    [['--since', '0h'], 'Invalid time format'],
    [['--since', '31d'], '30 days'],
    [
      ['--since', '2026-08-01T00:00:00Z', '--until', '2026-08-02T00:00:00Z'],
      'within the last 30 days',
    ],
    [['--since', '1h', '--until', '2h'], 'earlier'],
  ])('rejects invalid input before scope resolution: %j', async (args, error) => {
    const flags: SpanQueryFlags = Object.fromEntries(
      Array.from({ length: args.length / 2 }, (_, index) => {
        const flag = args[index * 2];
        const value = args[index * 2 + 1];
        return [flag, flag === '--limit' ? Number(value) : value];
      })
    );
    expect(await resolveSpanQuery(client, flags, telemetry)).toEqual({
      exitCode: 2,
    });
    expect(client.stderr.getFullOutput()).toContain(error);
    expect(resolveConfigScope).not.toHaveBeenCalled();
    expect(getLinkFromDir).not.toHaveBeenCalled();
  });

  describe('events transport', () => {
    const path = '/v1/observability/events';
    const query: SpanQuery = {
      scope: { ownerId: 'team_dummy' },
      timeRange: {
        start: '2026-09-08T11:00:00.000Z',
        end: '2026-09-08T12:00:00.000Z',
      },
      filter: exclusion,
      limit: 100,
    };
    const fetchFirstPage = () =>
      fetchEventPages(client, spanEventsRequest(query), query.limit).next();

    it.each([
      400, 422,
    ])('explains generated filter positions on %s without rewriting API details', async status => {
      const issue = 'Unexpected token at position 55';
      client.scenario.post(path, (_req, res) => {
        res.status(status).json({
          error: {
            message: 'Invalid request',
            issues: [{ path: 'filter', message: issue }],
          },
        });
      });
      const error = await fetchFirstPage().catch(err => err);
      expect(handleSpanQueryError(client, error)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('filter: ' + issue);
      expect(client.stderr.getFullOutput()).toContain(
        'Filter error positions refer to the generated filter, including CLI-added clauses.'
      );
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('does not explain filter positions for unrelated validation issues', async () => {
      client.scenario.post(path, (_req, res) => {
        res.status(400).json({
          error: {
            message: 'Invalid request',
            issues: [{ path: 'timeRange', message: 'Invalid bounds' }],
          },
        });
      });
      const error = await fetchFirstPage().catch(err => err);
      expect(handleSpanQueryError(client, error)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Invalid request: timeRange: Invalid bounds (400)'
      );
      expect(client.stderr.getFullOutput()).not.toContain('generated filter');
    });

    it('uses the correct endpoint, token, reason, and request body', async () => {
      client.config.currentTeam = 'team_other';
      client.scenario.post(path, (req, res) => {
        expect(req.query).toEqual({ teamId: 'team_dummy' });
        expect(req.headers.authorization).toBe('Bearer token_dummy');
        expect(req.headers['x-vercel-observability-query-reason']).toBe(
          'cli/traces-search'
        );
        expect(req.body).toEqual({
          event: 'vercel.span',
          scope: { ownerId: 'team_dummy' },
          timeRange: query.timeRange,
          select: ['span', 'resource'],
          order: 'desc',
          limit: 100,
          filter: exclusion,
        });
        res.json({
          events: [],
          pagination: { hasMore: false, nextCursor: null },
        });
      });
      expect(await fetchFirstPage()).toEqual({
        done: false,
        value: { events: [], excludedIntervals: [], nextCursor: null },
      });
    });

    it('uses the public events route relative to the client API origin', async () => {
      const fetch = vi.spyOn(client, 'fetch').mockResolvedValue({
        events: [],
        pagination: { hasMore: false, nextCursor: null },
      });
      await fetchFirstPage();
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        '/v1/observability/events?teamId=team_dummy',
        expect.objectContaining({
          method: 'POST',
          bailOn429: true,
          useCurrentTeam: false,
        })
      );
    });

    it('does not retry 429 and preserves API issue details', async () => {
      let attempts = 0;
      client.scenario.post(path, (_req, res) => {
        attempts++;
        res
          .set('Retry-After', '60')
          .status(429)
          .json({
            error: {
              message: 'Too many requests',
              issues: [{ path: 'filter', message: 'Query limit reached' }],
            },
          });
      });
      const error = await fetchFirstPage().catch(err => err);
      expect(attempts).toBe(1);
      expect(handleSpanQueryError(client, error)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Too many requests: filter: Query limit reached'
      );
      expect(client.stderr.getFullOutput()).toContain(
        'Wait at least 60 seconds before trying again.'
      );
      expect(client.stderr.getFullOutput()).not.toContain('generated filter');
    });
  });
});
