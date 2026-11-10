import { join } from 'path';
import { outputJSON } from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import logs from '../../../../src/commands/logs';

const NOW = Date.parse('2026-10-07T14:00:00.000Z');
const linkedFixture = join(
  __dirname,
  '../../../fixtures/unit/commands/logs/linked-project'
);

const logsProject = {
  ...defaultProject,
  id: 'prj_logstest',
  name: 'logs-test-project',
  accountId: 'team_dummy',
};

const runtimeEvent = {
  timestamp: '2026-10-07T13:59:00.123Z',
  projectId: 'prj_logstest',
  requestId: 'iad1::abcde-1791381540123-0123456789ab',
  deploymentId: 'dpl_123',
  environment: 'production',
  source: 'serverless',
  service: null,
  level: 'error',
  message: 'Error: boom\n    at handler (index.js:1:1)',
  truncated: false,
};

const requestEvent = {
  timestamp: '2026-10-07T13:58:00.000Z',
  requestId: 'abcde-1791381480000-0123456789ab',
  requestHostname: 'logs-test.vercel.app',
  requestPath: '/api/checkout',
  requestMethod: 'POST',
  httpStatus: 502,
  cacheResult: 'MISS',
};

interface EventsCall {
  query: Request['query'];
  headers: Request['headers'];
  body: Record<string, any>;
}

type PageResponder = (
  call: EventsCall,
  index: number,
  res: Response
) => void | Record<string, unknown>;

function page(
  events: Record<string, unknown>[],
  nextCursor: string | null = null,
  meta: Record<string, unknown> = {}
) {
  return {
    queryId: 'q_1',
    events,
    pagination: { hasMore: nextCursor !== null, nextCursor },
    meta,
  };
}

function useEvents(...responders: Array<PageResponder | object>) {
  const calls: EventsCall[] = [];
  client.scenario.post('/v1/observability/events', (req, res) => {
    const call = { query: req.query, headers: req.headers, body: req.body };
    calls.push(call);
    const index = calls.length - 1;
    const responder = responders[Math.min(index, responders.length - 1)];
    const result =
      typeof responder === 'function'
        ? (responder as PageResponder)(call, index, res)
        : responder;
    if (result && !res.headersSent) {
      res.json(result);
    }
  });
  return calls;
}

function apiError(
  res: Response,
  status: number,
  error: Record<string, unknown>
) {
  res.status(status).json({ error });
}

function stdout() {
  return client.stdout.getFullOutput();
}

function stderr() {
  return client.stderr.getFullOutput();
}

/** Parses stdout as JSON Lines. */
function jsonLines(): Array<Record<string, any>> {
  return stdout()
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line));
}

function summaryOf(lines: Array<Record<string, any>>) {
  const summaries = lines.filter(line => line.type === 'summary');
  expect(summaries).toHaveLength(1);
  expect(lines[lines.length - 1].type).toBe('summary');
  return summaries[0];
}

/** Parses the single JSON error document on stderr. */
function jsonError(): Record<string, any> {
  const lines = stderr()
    .split('\n')
    .filter(line => line.trim() !== '');
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}

function decodeToken(token: string): Record<string, any> {
  return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
}

describe('logs', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    useUser();
    useTeams('team_dummy');
    useProject(logsProject);
    client.cwd = linkedFixture;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VERCEL_ORG_ID;
    delete process.env.VERCEL_PROJECT_ID;
  });

  describe('help', () => {
    it('shows generic help with data sources and common filter fields', async () => {
      client.setArgv('logs', '--help');
      expect(await logs(client)).toBe(0);

      const output = stderr();
      expect(output).toContain('Display logs.');
      expect(output).toContain('Data sources');
      expect(output).toContain('Display runtime log entries');
      expect(output).toContain('(default)');
      expect(output).toContain('Display CDN request records');
      expect(output).toContain('Common --query fields');
      expect(output).toContain('runtime (default)');
      expect(output).toContain('requestHostname');
      expect(output).toContain('Background function executions are excluded.');
      expect(output).toContain(
        'Additional public fields supported by the API are accepted.'
      );
      expect(output).not.toContain('--follow');
      expect(output).not.toContain('--search');
      expect(output).not.toContain('--branch');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'logs' },
      ]);
    });

    it('shows runtime help with field types and bare-text syntax', async () => {
      client.setArgv('logs', 'runtime', '--help');
      expect(await logs(client)).toBe(0);

      const output = stderr();
      expect(output).toContain('Display runtime log entries');
      expect(output).toMatch(
        /isSystemLog\s+boolean; example: isSystemLog:false/
      );
      expect(output).toMatch(
        /requestId\s+string; example: requestId:"<request-id>"/
      );
      expect(output).toContain('Search message tokens, ignoring case');
      expect(output).toContain('unexpected token equals unexpected AND token.');
      expect(output).toContain(
        'Search messages with unquoted words; bare "unexpected token" is rejected.'
      );
      expect(output).toContain('json AND (parse OR (unexpected AND token)).');
      expect(output).toContain('Quotes work only in field values.');
      expect(output).not.toContain('bare quoted phrase searches');
      expect(output).toContain('Common values:');
      expect(output).toContain(
        'source: function, middleware, ci, edge, daemon'
      );
      expect(output).not.toContain('httpStatus');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'logs:runtime' },
      ]);
    });

    it('shows requests help with numeric comparisons and the exclusion', async () => {
      client.setArgv('logs', 'requests', '--help');
      expect(await logs(client)).toBe(0);

      const output = stderr();
      expect(output).toMatch(/httpStatus\s+number; example: httpStatus >= 500/);
      expect(output).toContain('Compare numeric fields');
      expect(output).toContain('bare-text search is unavailable for requests');
      expect(output).toContain('Quotes work only in field values.');
      expect(output).not.toContain('unexpected token');
      expect(output).toContain(
        'Background function executions are always excluded'
      );
    });
  });

  describe('runtime', () => {
    it('queries the last 30 minutes of runtime logs for the linked project', async () => {
      const calls = useEvents(page([runtimeEvent]));
      client.setArgv('logs');

      expect(await logs(client)).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].query).toEqual({ teamId: 'team_dummy' });
      expect(calls[0].headers['x-vercel-observability-query-reason']).toBe(
        'cli/logs-runtime'
      );
      expect(calls[0].body).toEqual({
        event: 'vercel.log',
        scope: { ownerId: 'team_dummy', projectIds: ['prj_logstest'] },
        timeRange: {
          start: '2026-10-07T13:30:00.000Z',
          end: '2026-10-07T14:00:00.000Z',
        },
        select: expect.arrayContaining([
          'message',
          'level',
          'attributes',
          'branch',
          'projectId',
        ]),
        order: 'desc',
        limit: 100,
      });
      expect(calls[0].body.select).not.toContain('timestamp');
    });

    it('returns the same query for implicit and explicit runtime', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--query', 'level:error');
      expect(await logs(client)).toBe(0);
      client.setArgv('logs', 'runtime', '--query', 'level:error');
      expect(await logs(client)).toBe(0);

      expect(calls).toHaveLength(2);
      expect(calls[1].body).toEqual(calls[0].body);
      expect(calls[0].body.filter).toBe('(level:error)');
    });

    it('prints full multiline messages and the producer on stdout', async () => {
      useEvents(
        page([
          runtimeEvent,
          {
            ...runtimeEvent,
            level: 'info',
            service: 'api',
            message: 'hello',
            truncated: true,
          },
        ])
      );
      client.setArgv('logs');

      expect(await logs(client)).toBe(0);
      const lines = stdout().split('\n');
      expect(lines[0]).toMatch(/TIME\s+LEVEL\s+SERVICE\/SOURCE\s+MESSAGE/);
      expect(lines[1]).toMatch(/error\s+serverless\s+Error: boom/);
      expect(lines[2]).toMatch(/^\s+at handler \(index\.js:1:1\)$/);
      expect(lines[3]).toMatch(/info\s+api\s+hello/);
      expect(lines[4]).toContain('[message truncated]');
      expect(stderr()).toMatch(
        /Runtime logs for \S+\/logs-test-project, 2026-10-0\d/
      );
    });

    it('emits typed JSON Lines with unchanged API events and a summary', async () => {
      const events = [
        runtimeEvent,
        { ...runtimeEvent, message: 'same' },
        { ...runtimeEvent, message: 'same' },
      ];
      useEvents(page(events));
      client.setArgv('logs', '--json');

      expect(await logs(client)).toBe(0);
      const lines = jsonLines();
      expect(lines.slice(0, 3)).toEqual(
        events.map(event => ({ type: 'log', data: event }))
      );
      expect(summaryOf(lines)).toEqual({
        type: 'summary',
        recordsReturned: 3,
        timeRange: {
          start: '2026-10-07T13:30:00.000Z',
          end: '2026-10-07T14:00:00.000Z',
        },
        pagination: { hasMore: false, next: null },
        excludedIntervals: [],
      });
      expect(stderr()).toBe('');
    });

    it.each([
      [['--format', 'json']],
      [['--format=json']],
      [['-F', 'json']],
    ])('prints the same JSON Lines with %j', async args => {
      useEvents(page([runtimeEvent]));
      client.setArgv('logs', ...args);

      expect(await logs(client)).toBe(0);
      const lines = jsonLines();
      expect(lines[0]).toEqual({ type: 'log', data: runtimeEvent });
      expect(summaryOf(lines).recordsReturned).toBe(1);
      expect(stderr()).toBe('');
    });

    it('reports an unsupported --format as JSON when --json is also given', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--json', '--format', 'yaml');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({
        reason: 'invalid_arguments',
        message: expect.stringContaining('Invalid output format: "yaml"'),
      });
      expect(calls).toHaveLength(0);
    });

    it('rejects an unsupported --format before querying', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--format', 'yaml');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('Invalid output format: "yaml"');
      expect(calls).toHaveLength(0);
    });

    it.each([
      [['-j']],
      [['-jf']],
    ])('explains that -j was removed for %j', async args => {
      const calls = useEvents(page([]));
      client.setArgv('logs', ...args);

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('-j was removed. Use --json.');
      expect(calls).toHaveLength(0);
    });

    it('reports the removed -j as JSON in non-interactive mode', async () => {
      client.nonInteractive = true;
      client.setArgv('logs', '-jf');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({
        reason: 'invalid_arguments',
        message: '-j was removed. Use --json.',
      });
    });

    it('treats --json=true as JSON for parse errors', async () => {
      client.setArgv('logs', '--json=true', '--unknown-flag');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({ reason: 'invalid_arguments' });
    });

    it('prints JSON Lines in non-interactive mode without --json', async () => {
      useEvents(page([runtimeEvent]));
      client.nonInteractive = true;
      client.setArgv('logs');

      expect(await logs(client)).toBe(0);
      const lines = jsonLines();
      expect(lines[0]).toEqual({ type: 'log', data: runtimeEvent });
      expect(summaryOf(lines).recordsReturned).toBe(1);
      expect(stderr()).toBe('');
    });

    it('stops quietly with exit 0 when stdout is closed', async () => {
      useEvents(page([runtimeEvent], 'cursor_1'));
      client.stdout.destroy();
      client.setArgv('logs', '--json');

      expect(await logs(client)).toBe(0);
      expect(stderr()).toBe('');
    });

    it('prints an empty-result hint and exits 0', async () => {
      useEvents(page([]));
      client.setArgv('logs');

      expect(await logs(client)).toBe(0);
      expect(stdout()).toBe('');
      expect(stderr().match(/Fetching runtime log entries…/g)).toHaveLength(1);
      expect(stderr()).toContain('No runtime log entries found in this window');
      expect(stderr()).toContain('Use an earlier --since');
    });

    it('prints only a summary for an empty JSON result', async () => {
      useEvents(page([]));
      client.setArgv('logs', '--json');

      expect(await logs(client)).toBe(0);
      expect(jsonLines()).toEqual([
        {
          type: 'summary',
          recordsReturned: 0,
          timeRange: {
            start: '2026-10-07T13:30:00.000Z',
            end: '2026-10-07T14:00:00.000Z',
          },
          pagination: { hasMore: false, next: null },
          excludedIntervals: [],
        },
      ]);
      expect(stderr()).toBe('');
    });
  });

  describe('requests', () => {
    it('queries CDN requests with the background function exclusion and whole seconds', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW + 456);
      const calls = useEvents(page([requestEvent]));
      client.setArgv('logs', 'requests', '--query', 'httpStatus >= 500');

      expect(await logs(client)).toBe(0);
      expect(calls[0].headers['x-vercel-observability-query-reason']).toBe(
        'cli/logs-requests'
      );
      expect(calls[0].body).toMatchObject({
        event: 'vercel.proxy_response',
        timeRange: {
          start: '2026-10-07T13:30:00.000Z',
          end: '2026-10-07T14:00:00.000Z',
        },
        filter: '(NOT pathType:"background_func") AND (httpStatus >= 500)',
      });
      expect(stdout()).toMatch(
        /STATUS\s+METHOD\s+CACHE\s+REQUEST ID\s+HOST AND PATH/
      );
      expect(stdout()).toMatch(
        /502\s+POST\s+MISS\s+abcde-1791381480000-0123456789ab\s+logs-test\.vercel\.app\/api\/checkout/
      );
    });

    it('keeps the exclusion when a filter selects background functions', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', 'requests', '--query', 'pathType:background_func');

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.filter).toBe(
        '(NOT pathType:"background_func") AND (pathType:background_func)'
      );
      expect(stderr()).toContain(
        'Background function executions are always excluded.'
      );
    });

    it('explains API rejections of bare text with source-specific help', async () => {
      useEvents((_call, _index, res) =>
        apiError(res, 400, {
          code: 'invalid_request',
          message: 'Invalid events request',
          issues: [
            {
              path: 'filter',
              message:
                'Text search is not supported by event "vercel.proxy_response"',
            },
          ],
        })
      );
      client.setArgv('logs', 'requests', '--query', 'checkout');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(
        'requests: Text search is not supported by event "vercel.proxy_response"'
      );
      expect(stderr()).toContain('logs requests --help');
      expect(stdout()).toBe('');
    });

    it('reports API validation issues as one JSON error document', async () => {
      useEvents((_call, _index, res) =>
        apiError(res, 400, {
          code: 'invalid_request',
          message: 'Invalid events request',
          issues: [{ path: 'filter', message: 'Expected a value after ":"' }],
        })
      );
      client.setArgv('logs', 'requests', '--query', 'foo::', '--json');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        message: 'The requests query was rejected.',
        data: {
          httpStatus: 400,
          issues: [
            {
              field: 'filter',
              reason: 'invalid',
              message: 'Expected a value after ":"',
            },
          ],
        },
      });
    });

    it('explains CDN request access requirements', async () => {
      useEvents((_call, _index, res) =>
        apiError(res, 402, {
          code: 'payment_required',
          message: 'Observability Plus is required for this query.',
        })
      );
      client.setArgv('logs', 'requests');

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain(
        'CDN request logs require Observability Plus, a Priority project, or the Enterprise Agents & Apps entitlement.'
      );
    });

    it('warns about excluded intervals on stderr and still succeeds', async () => {
      useEvents(
        page([], null, {
          excludedIntervals: [
            {
              start: '2026-10-07T13:30:00.000Z',
              end: '2026-10-07T13:40:00.000Z',
            },
          ],
        })
      );
      client.setArgv('logs', 'requests');

      expect(await logs(client)).toBe(0);
      expect(stderr()).toContain(
        'Results omit 2026-10-07T13:30:00.000Z to 2026-10-07T13:40:00.000Z'
      );
    });

    it('reports excluded intervals as stream_gap lines and in the summary of an empty result', async () => {
      const interval = {
        start: '2026-10-07T13:30:00.000Z',
        end: '2026-10-07T13:40:00.000Z',
      };
      useEvents(page([], null, { excludedIntervals: [interval] }));
      client.setArgv('logs', 'requests', '--json');

      expect(await logs(client)).toBe(0);
      const lines = jsonLines();
      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual({
        type: 'warning',
        reason: 'stream_gap',
        message:
          'Results omit 2026-10-07T13:30:00.000Z to 2026-10-07T13:40:00.000Z: data for this period is unavailable to this query.',
        data: interval,
      });
      expect(summaryOf(lines)).toMatchObject({
        recordsReturned: 0,
        pagination: { hasMore: false, next: null },
        excludedIntervals: [interval],
      });
      expect(stderr()).toBe('');
    });

    it('deduplicates and sorts excluded intervals across pages', async () => {
      const early = {
        start: '2026-10-07T13:30:00.000Z',
        end: '2026-10-07T13:31:00.000Z',
      };
      const late = {
        start: '2026-10-07T13:50:00.000Z',
        end: '2026-10-07T13:51:00.000Z',
      };
      useEvents(
        page([requestEvent], 'cursor_1', { excludedIntervals: [late] }),
        page([requestEvent], null, { excludedIntervals: [early, late] })
      );
      client.setArgv('logs', 'requests', '--limit', '2', '--json');

      expect(await logs(client)).toBe(0);
      const lines = jsonLines();
      const gaps = lines.filter(line => line.type === 'warning');
      expect(gaps.map(line => line.data)).toEqual([early, late]);
      expect(lines.slice(0, 2).map(line => line.type)).toEqual([
        'request',
        'request',
      ]);
      expect(summaryOf(lines).excludedIntervals).toEqual([early, late]);
    });
  });

  describe('filters', () => {
    it('combines deployment, environment, and user filters so OR cannot bypass them', async () => {
      client.scenario.get('/v13/deployments/:id', (req, res) => {
        expect(req.params.id).toBe('dpl_123');
        res.json({ id: 'dpl_123', projectId: 'prj_logstest' });
      });
      const calls = useEvents(page([]));
      client.setArgv(
        'logs',
        'requests',
        '--deployment',
        'dpl_123',
        '--environment',
        'staging',
        '--query',
        'httpStatus >= 500 OR cacheResult:MISS'
      );

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.filter).toBe(
        '(deploymentId:"dpl_123") AND (environment:"staging") AND (NOT pathType:"background_func") AND (httpStatus >= 500 OR cacheResult:MISS)'
      );
    });

    it('accepts the -q shorthand', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '-q', 'level:error');

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.filter).toBe('(level:error)');
    });

    it.each([
      [''],
      ['   '],
    ])('rejects an empty --project %j instead of using the link', async value => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--project', value);

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('--project must not be empty.');
      expect(calls).toHaveLength(0);
    });

    it('rejects an empty filter before querying', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--query', '  ');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('--query must not be empty.');
      expect(calls).toHaveLength(0);
    });
  });

  describe('time range', () => {
    it.each([
      [
        ['--since', '1h'],
        '2026-10-07T13:00:00.000Z',
        '2026-10-07T14:00:00.000Z',
      ],
      [
        ['--until', '10m'],
        '2026-10-07T13:20:00.000Z',
        '2026-10-07T13:50:00.000Z',
      ],
      [
        ['--until', '1h'],
        '2026-10-07T12:30:00.000Z',
        '2026-10-07T13:00:00.000Z',
      ],
      [
        ['--since', '2h', '--until', '1h'],
        '2026-10-07T12:00:00.000Z',
        '2026-10-07T13:00:00.000Z',
      ],
      [
        ['--since', '2026-10-07T12:00:00Z', '--until', 'now'],
        '2026-10-07T12:00:00.000Z',
        '2026-10-07T14:00:00.000Z',
      ],
    ])('resolves %j from command start', async (args, start, end) => {
      const calls = useEvents(page([]));
      client.setArgv('logs', ...args);

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.timeRange).toEqual({ start, end });
    });

    it.each([
      [
        ['--since', '1h', '--until', '2h'],
        'Use --since to set an earlier start',
      ],
      [['--since', '30m', '--until', '30m'], 'must be before the end'],
      [['--since', 'yesterday-ish'], 'Invalid time format'],
    ])('rejects %j before querying', async (args, message) => {
      const calls = useEvents(page([]));
      client.setArgv('logs', ...args);

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(message);
      expect(stdout()).toBe('');
      expect(calls).toHaveLength(0);
    });
  });

  describe('pagination', () => {
    it('pages with the cursor and a fixed window, and reports a continuation', async () => {
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(NOW)
        .mockReturnValue(NOW + 60_000);
      const calls = useEvents(
        page([runtimeEvent, runtimeEvent], 'cursor_1'),
        page([runtimeEvent], 'cursor_2')
      );
      client.setArgv('logs', '--limit', '3', '--json');

      expect(await logs(client)).toBe(0);
      expect(calls.map(call => [call.body.limit, call.body.cursor])).toEqual([
        [3, undefined],
        [1, 'cursor_1'],
      ]);
      expect(calls[1].body.timeRange).toEqual(calls[0].body.timeRange);
      const lines = jsonLines();
      expect(lines.filter(line => line.type === 'log')).toHaveLength(3);
      const summary = summaryOf(lines);
      expect(summary.recordsReturned).toBe(3);
      expect(summary.pagination.hasMore).toBe(true);
      expect(decodeToken(summary.pagination.next)).toEqual({
        v: 1,
        event: 'vercel.log',
        ownerId: 'team_dummy',
        projectIds: ['prj_logstest'],
        timeRange: calls[0].body.timeRange,
        order: 'desc',
        cursor: 'cursor_2',
      });
      expect(stderr()).toBe('');
    });

    it('prints the next page command in human output', async () => {
      useEvents(page([runtimeEvent], 'cursor_1'));
      client.setArgv('logs', '--limit', '1');

      expect(await logs(client)).toBe(0);
      expect(stderr()).toContain('More runtime log entries matched.');
      expect(stderr()).toMatch(/Next page:\n\s+`?vercel logs --next [\w-]+/);
      expect(stderr()).not.toContain('Increase --limit');
    });

    it('reports hasMore false when the limit equals the matching records', async () => {
      useEvents(page([runtimeEvent, runtimeEvent]));
      client.setArgv('logs', '--limit', '2', '--json');

      expect(await logs(client)).toBe(0);
      expect(summaryOf(jsonLines()).pagination).toEqual({
        hasMore: false,
        next: null,
      });
    });

    it('requests pages of at most 1000 records', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--limit', '5000');

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.limit).toBe(1000);
    });

    it('retries the same cursor with a smaller page when the result is too large', async () => {
      const calls = useEvents(
        (_call, _index, res) =>
          apiError(res, 413, {
            code: 'result_too_large',
            message: 'Result too large',
          }),
        page([runtimeEvent], 'cursor_1'),
        page([runtimeEvent])
      );
      client.setArgv('logs', '--limit', '1000', '--json');

      expect(await logs(client)).toBe(0);
      expect(calls.map(call => [call.body.limit, call.body.cursor])).toEqual([
        [1000, undefined],
        [500, undefined],
        [500, 'cursor_1'],
      ]);
    });

    it('fails clearly when a single record is too large', async () => {
      useEvents((_call, _index, res) =>
        apiError(res, 413, {
          code: 'result_too_large',
          message: 'Result too large',
        })
      );
      client.setArgv('logs', '--limit', '1');

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain('A single record exceeds the API response');
    });

    it('keeps partial output and exits 1 when a later page fails', async () => {
      useEvents(page([runtimeEvent], 'cursor_1'), (_call, _index, res) =>
        apiError(res, 400, { code: 'bad_request', message: 'Cursor expired' })
      );
      client.setArgv('logs');

      expect(await logs(client)).toBe(1);
      expect(stdout()).toMatch(/error\s+serverless\s+Error: boom/);
      expect(stderr()).toContain('Cursor expired');
      expect(stderr()).toContain('Output is incomplete: 1 runtime log entries');
      expect(stderr()).toMatch(
        /Retry the failed page:\n\s+`?vercel logs --next/
      );
    });

    it('reports a later page failure as a JSON error with a resume token', async () => {
      useEvents(page([runtimeEvent], 'cursor_1'), (_call, _index, res) =>
        apiError(res, 403, { code: 'forbidden', message: 'Not allowed' })
      );
      client.setArgv('logs', '--json');

      expect(await logs(client)).toBe(1);
      const lines = jsonLines();
      expect(lines).toEqual([{ type: 'log', data: runtimeEvent }]);
      const error = jsonError();
      expect(error).toMatchObject({
        status: 'error',
        reason: 'permission_denied',
        data: {
          recordsReturned: 1,
          outputIncomplete: true,
          pagination: { hasMore: true },
          excludedIntervals: [],
        },
      });
      expect(decodeToken(error.data.pagination.next).cursor).toBe('cursor_1');
    });

    it('clamps --limit above the maximum with a warning', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--limit', '20000', '--json');

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.limit).toBe(1000);
      const lines = jsonLines();
      expect(lines[0]).toEqual({
        type: 'warning',
        reason: 'limit_clamped',
        message: '--limit 20000 is above the maximum of 10000. Using 10000.',
        data: { requested: 20000, limit: 10000 },
      });
      expect(summaryOf(lines).recordsReturned).toBe(0);
    });

    it.each([0, 1.5])('rejects --limit %s', async limit => {
      client.setArgv('logs', '--limit', String(limit));

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(
        '`--limit` must be an integer between 1 and 10000'
      );
    });
  });

  describe('API errors', () => {
    it('adds a time-range hint to retention errors', async () => {
      useEvents((_call, _index, res) =>
        apiError(res, 400, {
          code: 'bad_request',
          message:
            'The hobby plan does not retain runtime logs for the requested time range.',
        })
      );
      client.setArgv('logs', '--since', '2h');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('does not retain runtime logs');
      expect(stderr()).toContain('Use a later --since');
    });
  });

  describe('continuation', () => {
    function token(overrides: Record<string, unknown> = {}): string {
      return Buffer.from(
        JSON.stringify({
          v: 1,
          event: 'vercel.proxy_response',
          ownerId: 'team_dummy',
          projectIds: ['prj_logstest'],
          timeRange: {
            start: '2026-10-07T12:00:00.000Z',
            end: '2026-10-07T13:00:00.000Z',
          },
          filter: '(NOT pathType:"background_func") AND (httpStatus >= 500)',
          order: 'desc',
          cursor: 'cursor_9',
          ...overrides,
        })
      ).toString('base64url');
    }

    it('continues with the identity from the cursor and a new limit', async () => {
      const calls = useEvents(page([requestEvent]));
      client.setArgv('logs', '--next', token(), '--limit', '5', '--json');

      expect(await logs(client)).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].headers['x-vercel-observability-query-reason']).toBe(
        'cli/logs-requests'
      );
      expect(calls[0].query).toEqual({ teamId: 'team_dummy' });
      expect(calls[0].body).toMatchObject({
        event: 'vercel.proxy_response',
        scope: { ownerId: 'team_dummy', projectIds: ['prj_logstest'] },
        timeRange: {
          start: '2026-10-07T12:00:00.000Z',
          end: '2026-10-07T13:00:00.000Z',
        },
        filter: '(NOT pathType:"background_func") AND (httpStatus >= 500)',
        order: 'desc',
        limit: 5,
        cursor: 'cursor_9',
      });
      const lines = jsonLines();
      expect(lines[0]).toEqual({ type: 'request', data: requestEvent });
      expect(summaryOf(lines).timeRange).toEqual({
        start: '2026-10-07T12:00:00.000Z',
        end: '2026-10-07T13:00:00.000Z',
      });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:requests', value: 'default' },
        { key: 'option:limit', value: '[REDACTED]' },
        { key: 'option:next', value: '[REDACTED]' },
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });

    it('round-trips the summary token into the next request', async () => {
      const calls = useEvents(
        page([runtimeEvent], 'cursor_1'),
        page([runtimeEvent])
      );
      client.setArgv(
        'logs',
        '--query',
        'level:error',
        '--limit',
        '1',
        '--json'
      );
      expect(await logs(client)).toBe(0);
      const next = summaryOf(jsonLines()).pagination.next;

      client.setArgv('logs', '--next', next, '--json');
      expect(await logs(client)).toBe(0);
      expect(calls[1].body).toEqual({
        ...calls[0].body,
        limit: 100,
        cursor: 'cursor_1',
      });
    });

    it('uses the team in the cursor regardless of the link and current team', async () => {
      useProject({
        ...logsProject,
        id: 'prj_other',
        name: 'other-project',
        accountId: 'team_other',
      });
      const calls = useEvents(page([]));
      client.cwd = setupTmpDir();
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'logs',
        '--next',
        token({ ownerId: 'team_other', projectIds: ['prj_other'] }),
        '--json'
      );

      expect(await logs(client)).toBe(0);
      expect(calls[0].query).toEqual({ teamId: 'team_other' });
      expect(calls[0].body.scope).toEqual({
        ownerId: 'team_other',
        projectIds: ['prj_other'],
      });
    });

    it('rejects an explicit --scope for a different team before the events query', async () => {
      const calls = useEvents(page([]));
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'logs',
        '--scope',
        'dummy',
        '--next',
        token({ ownerId: 'team_other' })
      );

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('belongs to a different team than --scope');
      expect(calls).toHaveLength(0);
    });

    it('accepts an explicit --scope that matches the cursor team', async () => {
      const calls = useEvents(page([]));
      client.config.currentTeam = 'team_dummy';
      client.setArgv('logs', '--scope', 'dummy', '--next', token(), '--json');

      expect(await logs(client)).toBe(0);
      expect(calls).toHaveLength(1);
    });

    it.each([
      ['--project', 'logs-test-project'],
      ['--deployment', 'dpl_123'],
      ['--environment', 'production'],
      ['--query', 'httpStatus:500'],
      ['--since', '1h'],
      ['--until', '10m'],
    ])('rejects %s with --next', async (flag, value) => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--next', token(), flag, value);

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(`${flag} can't be combined with --next`);
      expect(calls).toHaveLength(0);
    });

    it('rejects a data source that does not match the cursor', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', 'runtime', '--next', token());

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('continues a requests query');
      expect(calls).toHaveLength(0);
    });

    it.each([
      ['null'],
      ['not-a-token'],
      [token({ v: 2 })],
      [token({ event: 'vercel.span' })],
      [token({ projectIds: [] })],
      [token({ timeRange: { start: 'soon', end: 'later' } })],
    ])('rejects malformed cursor %s as a JSON usage error', async value => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--next', value, '--json');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({
        reason: 'invalid_arguments',
        message: expect.stringContaining('--next is not a valid cursor'),
      });
      expect(calls).toHaveLength(0);
    });

    it('rejects an empty --next', async () => {
      client.setArgv('logs', '--next', ' ');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('--next must not be empty.');
    });
  });

  describe('target selection', () => {
    it('resolves an explicit project within the linked team', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', '--project', 'logs-test-project');

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.scope).toEqual({
        ownerId: 'team_dummy',
        projectIds: ['prj_logstest'],
      });
    });

    it('fails when an explicit team conflicts with the linked team', async () => {
      const calls = useEvents(page([]));
      client.config.currentTeam = 'team_other';
      client.setArgv('logs', '--scope', 'other');

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain(
        'This directory is linked to a project in team'
      );
      expect(stderr()).toContain('--project <name>');
      expect(calls).toHaveLength(0);
    });

    it('allows a fully explicit target in another team', async () => {
      useProject({ ...logsProject, id: 'prj_other', name: 'other-project' });
      const calls = useEvents(page([]));
      client.config.currentTeam = 'team_other';
      client.setArgv('logs', '--scope', 'other', '--project', 'other-project');

      expect(await logs(client)).toBe(0);
      expect(calls[0].query).toEqual({ teamId: 'team_other' });
      expect(calls[0].body.scope).toEqual({
        ownerId: 'team_other',
        projectIds: ['prj_other'],
      });
    });

    it('explains how to select a target when unlinked', async () => {
      client.cwd = setupTmpDir();
      client.setArgv('logs', '--project', 'logs-test-project');

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain("Your codebase isn't linked to a project");
      expect(stderr()).toContain('--scope <team> --project <name>');
    });

    it('rejects projects owned by a personal account', async () => {
      const cwd = setupTmpDir();
      await outputJSON(join(cwd, '.vercel/project.json'), {
        orgId: 'user_123',
        projectId: 'prj_logstest',
      });
      client.cwd = cwd;
      client.setArgv('logs');

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain('team-owned projects only');
    });

    it.each([
      false,
      true,
    ])('selects the explicit project from a multi-project repository link (non-interactive=%s)', async nonInteractive => {
      const cwd = setupTmpDir();
      await outputJSON(join(cwd, '.vercel/repo.json'), {
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
            orgId: 'team_dummy',
          },
        ],
      });
      useProject({ ...logsProject, id: 'prj_b', name: 'app-b' });
      const select = vi.spyOn(client.input, 'select');
      const calls = useEvents(page([]));
      client.cwd = cwd;
      client.nonInteractive = nonInteractive;
      client.setArgv('logs', '--project', 'app-b', '--json');

      expect(await logs(client)).toBe(0);
      expect(select).not.toHaveBeenCalled();
      expect(calls[0].body.scope).toEqual({
        ownerId: 'team_dummy',
        projectIds: ['prj_b'],
      });
    });

    it('uses VERCEL_ORG_ID and VERCEL_PROJECT_ID as a link', async () => {
      process.env.VERCEL_ORG_ID = 'team_dummy';
      process.env.VERCEL_PROJECT_ID = 'prj_logstest';
      client.cwd = setupTmpDir();
      const calls = useEvents(page([]));
      client.setArgv('logs');

      expect(await logs(client)).toBe(0);
      expect(calls[0].body.scope.projectIds).toEqual(['prj_logstest']);
    });

    it('reports an incomplete environment link', async () => {
      process.env.VERCEL_ORG_ID = 'team_dummy';
      client.setArgv('logs');

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain('you forgot to specify `VERCEL_PROJECT_ID`');
    });

    it('rejects a deployment from another project', async () => {
      client.scenario.get('/v13/deployments/:id', (_req, res) => {
        res.json({ id: 'dpl_123', projectId: 'prj_elsewhere' });
      });
      useProject({ ...logsProject, id: 'prj_elsewhere', name: 'elsewhere' });
      client.setArgv(
        'logs',
        '--deployment',
        'dpl_123',
        '--project',
        'logs-test-project'
      );

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain(
        'Deployment dpl_123 does not belong to project logs-test-project'
      );
    });
  });

  describe('arguments and migration', () => {
    /** Resolves any deployment ID or host to `dpl_123` in the logs project. */
    function useDeployment() {
      const requested: string[] = [];
      client.scenario.get('/v13/deployments/:id', (req, res) => {
        requested.push(req.params.id);
        res.json({ id: 'dpl_123', projectId: 'prj_logstest' });
      });
      return requested;
    }

    it.each<[string[], string, string]>([
      [['dpl_123'], 'dpl_123', '--deployment dpl_123'],
      [
        ['https://my-app.vercel.app'],
        'my-app.vercel.app',
        '--deployment my-app.vercel.app',
      ],
      [['-d', 'dpl_123'], 'dpl_123', '--deployment dpl_123'],
      [['requests', 'dpl_123'], 'dpl_123', '--deployment dpl_123'],
    ])('runs deployment positional %j as --deployment with a deprecation warning', async (args, lookup, flag) => {
      const requested = useDeployment();
      const calls = useEvents(page([]));
      client.setArgv('logs', ...args);

      expect(await logs(client)).toBe(0);
      expect(requested).toEqual([lookup]);
      expect(calls).toHaveLength(1);
      expect(calls[0].body.filter).toContain('(deploymentId:"dpl_123")');
      expect(stderr()).toContain(
        `Passing a deployment as an argument is deprecated. Use ${flag}.`
      );
      expect(stderr()).not.toContain(`vercel logs ${flag}`);
    });

    it('prints the positional deployment deprecation as a JSON warning line', async () => {
      useDeployment();
      useEvents(page([runtimeEvent]));
      client.setArgv('logs', 'dpl_123', '--json');

      expect(await logs(client)).toBe(0);
      const lines = jsonLines();
      expect(lines.map(line => line.type)).toEqual([
        'warning',
        'log',
        'summary',
      ]);
      expect(lines[0]).toMatchObject({
        reason: 'deprecated',
        message:
          'Passing a deployment as an argument is deprecated. Use --deployment dpl_123.',
      });
      expect(stderr()).toBe('');
    });

    it('warns for both --follow and a positional deployment', async () => {
      useDeployment();
      const calls = useEvents(page([runtimeEvent]));
      client.setArgv('logs', 'my-app.vercel.app', '--follow');

      expect(await logs(client)).toBe(0);
      expect(calls).toHaveLength(1);
      expect(stderr()).toContain('--follow is deprecated');
      expect(stderr()).toContain(
        'Passing a deployment as an argument is deprecated.'
      );
    });

    it('rejects a positional deployment combined with --deployment', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', 'dpl_123', '--deployment', 'dpl_456');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(
        'Pass the deployment once, with --deployment.'
      );
      expect(calls).toHaveLength(0);
    });

    it('rejects a positional deployment combined with --next', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', 'dpl_123', '--next', 'cursor');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(
        "A deployment argument can't be combined with --next"
      );
      expect(calls).toHaveLength(0);
    });

    it('names the deployment argument when it belongs to another project', async () => {
      client.scenario.get('/v13/deployments/:id', (_req, res) => {
        res.json({ id: 'dpl_123', projectId: 'prj_elsewhere' });
      });
      useProject({ ...logsProject, id: 'prj_elsewhere', name: 'elsewhere' });
      client.setArgv('logs', 'dpl_123', '--project', 'logs-test-project');

      expect(await logs(client)).toBe(1);
      expect(stderr()).toContain(
        'Deployment dpl_123 does not belong to project logs-test-project. Remove the deployment argument or --project.'
      );
    });

    it('rejects more than one positional argument', async () => {
      const calls = useEvents(page([]));
      client.setArgv('logs', 'dpl_123', 'dpl_456');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain('logs --deployment dpl_123');
      expect(stderr()).not.toContain('is deprecated');
      expect(calls).toHaveLength(0);
    });

    it('shell-quotes a positional deployment in the suggested command', async () => {
      useDeployment();
      useEvents(page([]));
      client.setArgv('logs', 'dpl_x;touch /tmp/marker');

      expect(await logs(client)).toBe(0);
      expect(stderr()).toContain("Use --deployment 'dpl_x;touch /tmp/marker'.");
      expect(stderr()).not.toContain('--deployment dpl_x;touch');
    });

    it('lists the data sources for an unknown source', async () => {
      client.setArgv('logs', 'runtiem');

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(
        'Unknown data source "runtiem". Use runtime or requests.'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:runtime', value: 'default' },
        { key: 'argument:positional', value: 'unknown' },
      ]);
    });

    it('records the kind of a positional deployment without its value', async () => {
      useDeployment();
      useEvents(page([]));
      client.setArgv('logs', 'dpl_123');

      expect(await logs(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:runtime', value: 'default' },
        { key: 'argument:positional', value: 'deployment' },
      ]);
    });

    it('records removed options by name only', async () => {
      client.setArgv('logs', '--level', 'error', '--request-id', 'secret-id');

      expect(await logs(client)).toBe(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:runtime', value: 'default' },
        { key: 'option:request-id', value: 'removed' },
        { key: 'option:level', value: 'removed' },
      ]);
    });

    it('records the removed -j shorthand', async () => {
      client.setArgv('logs', '-j');

      expect(await logs(client)).toBe(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:j', value: 'removed' },
      ]);
    });

    it.each([
      [['--search', 'error'], '--search was replaced by --query'],
      [['--level', 'error'], "--query 'level:error'"],
      [
        ['--level', 'error', '--level', 'warning'],
        "--query 'level:(error OR warning)'",
      ],
      [['--source', 'serverless'], "--query 'source:function'"],
      [['--source', 'static'], 'Static and CDN traffic is in'],
      [['--source', 'edge-middleware'], "--query 'source:<value>'"],
      [
        ['--status-code', '5xx'],
        "logs requests --query 'httpStatus >= 500 AND httpStatus < 600'",
      ],
      [['--status-code', '404'], "logs requests --query 'httpStatus:404'"],
      [['--request-id', 'abc-123'], `--query 'requestId:"abc-123"'`],
      [['--branch', 'main'], '--branch is no longer supported'],
      [['--expand'], 'Full runtime messages are shown by default'],
      [['--no-follow'], '--no-follow was removed and has no effect'],
    ])('explains the replacement for %j', async (args, message) => {
      const calls = useEvents(page([]));
      client.setArgv('logs', ...args);

      expect(await logs(client)).toBe(2);
      expect(stderr()).toContain(message);
      expect(calls).toHaveLength(0);
    });

    it('warns for deprecated --follow and runs the bounded query', async () => {
      const calls = useEvents(page([runtimeEvent]));
      client.setArgv('logs', '--follow');

      expect(await logs(client)).toBe(0);
      expect(calls).toHaveLength(1);
      expect(stderr()).toContain('--follow is deprecated');
    });

    it('prints the --follow deprecation as a JSON warning line', async () => {
      useEvents(page([runtimeEvent]));
      client.setArgv('logs', '--follow', '--json');

      expect(await logs(client)).toBe(0);
      const lines = jsonLines();
      expect(lines.map(line => line.type)).toEqual([
        'warning',
        'log',
        'summary',
      ]);
      expect(lines[0]).toMatchObject({
        reason: 'deprecated',
        message: expect.stringContaining('--follow is deprecated'),
      });
      expect(stderr()).toBe('');
    });

    it('reports usage errors as one JSON error document', async () => {
      client.setArgv('logs', 'runtiem', '--json');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        message: expect.stringContaining('Unknown data source "runtiem"'),
      });
    });

    it('reports parse errors as JSON when --format json is requested', async () => {
      client.setArgv('logs', '--unknown-flag', '--format', 'json');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({ reason: 'invalid_arguments' });
    });

    it('reports unknown options as a JSON error document', async () => {
      client.setArgv('logs', '--unknown-flag', '--json');

      expect(await logs(client)).toBe(2);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({ reason: 'invalid_arguments' });
    });

    it('reports target errors as JSON without progress on stderr', async () => {
      client.cwd = setupTmpDir();
      client.setArgv('logs', '--json');

      expect(await logs(client)).toBe(1);
      expect(stdout()).toBe('');
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'not_linked',
      });
    });

    it('does not warn about --follow when it is not supplied', async () => {
      useEvents(page([]));
      client.setArgv('logs');

      expect(await logs(client)).toBe(0);
      expect(stderr()).not.toContain('--follow');
    });
  });

  describe('telemetry', () => {
    it('records the effective source and filter presence without contents', async () => {
      useEvents(page([]));
      client.setArgv('logs', '--query', 'requestId:"secret"', '--json');

      expect(await logs(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:runtime', value: 'default' },
        { key: 'option:query', value: '[REDACTED]' },
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });

    it('records an explicit requests source', async () => {
      useEvents(page([]));
      client.setArgv('logs', 'requests');

      expect(await logs(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:requests', value: 'requests' },
      ]);
    });
  });
});
