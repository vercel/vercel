import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import metrics from '../../../../src/commands/metrics';
import * as linkModule from '../../../../src/util/projects/link';
import getScope from '../../../../src/util/get-scope';
import getProjectByNameOrId from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScope);
const mockedGetProjectByNameOrId = vi.mocked(getProjectByNameOrId);

const errorRateBody = {
  metrics: {
    errors: {
      metric: 'vercel.function_invocation.count',
      aggregation: 'count',
      filter: 'httpStatus >= 500',
    },
    total: { metric: 'vercel.function_invocation.count', aggregation: 'count' },
  },
  formulas: { errorRate: 'errors / total * 100' },
  outputs: ['errorRate'],
  groupBy: ['route'],
  bucketSeconds: 3600,
};

let postedBody: Record<string, unknown> | undefined;
let postedQuery: Record<string, unknown> | undefined;

function mockMetricsApi() {
  client.scenario.post('/metrics/v1', (req, res) => {
    postedBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    postedQuery = req.query as Record<string, unknown>;
    res.json({
      series: [
        {
          timestamp: '2026-07-29T09:00:00.000Z',
          dimensions: { route: '/api/checkout' },
          values: { errorRate: 2.5 },
        },
      ],
      summary: [
        { dimensions: { route: '/api/checkout' }, values: { errorRate: 2.5 } },
        { dimensions: { route: '/api/cart' }, values: { errorRate: null } },
      ],
      queryId: 'query_raw',
      meta: {
        sources: [{ id: 'functions' }],
        statistics: {
          elapsedMs: 10,
          databaseElapsedMs: 8,
          rowsRead: 100,
          bytesRead: 2048,
        },
      },
    });
  });
}

describe('metrics --body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    postedBody = undefined;
    postedQuery = undefined;
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'prj_metricstest',
        name: 'my-project',
        accountId: 'team_dummy',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
    });
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' },
      user: { id: 'user_dummy' },
    } as Awaited<ReturnType<typeof getScope>>);
    mockMetricsApi();
  });

  it('sends an inline body with scope and an aligned time range filled in', async () => {
    client.setArgv(
      'metrics',
      '--body',
      JSON.stringify(errorRateBody),
      '--since',
      '2026-07-29T09:00:42.123Z',
      '--until',
      '2026-07-29T10:00:42.123Z',
      '--format=json'
    );

    const exitCode = await metrics(client);

    expect(exitCode).toBe(0);
    expect(postedQuery).toMatchObject({ teamId: 'team_dummy' });
    expect(postedBody).toEqual({
      ...errorRateBody,
      scope: { ownerId: 'team_dummy', projectIds: ['prj_metricstest'] },
      timeRange: {
        start: '2026-07-29T09:00:00.000Z',
        end: '2026-07-29T11:00:00.000Z',
      },
    });
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.query).toEqual(postedBody);
    expect(json.queryId).toBe('query_raw');
    expect(json.series).toHaveLength(1);
    expect(json.summary).toHaveLength(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:body', value: '[REDACTED]' },
      { key: 'option:since', value: '[REDACTED]' },
      { key: 'option:until', value: '[REDACTED]' },
      { key: 'option:format', value: 'json' },
    ]);
  });

  it('reads the body from a file and keeps its scope and time range', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'metrics-body-'));
    const body = {
      ...errorRateBody,
      scope: { ownerId: 'team_other' },
      timeRange: {
        start: '2026-07-01T00:00:00.000Z',
        end: '2026-07-02T00:00:00.000Z',
      },
    };
    writeFileSync(join(dir, 'query.json'), JSON.stringify(body));
    client.cwd = dir;
    client.setArgv('metrics', '--body', '@query.json', '--format=json');

    const exitCode = await metrics(client);

    expect(exitCode).toBe(0);
    expect(postedBody).toEqual(body);
    expect(postedQuery).toMatchObject({ teamId: 'team_other' });
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('reads the body from stdin and scopes it to --project', async () => {
    mockedGetProjectByNameOrId.mockResolvedValue({
      id: 'prj_other',
      name: 'other-app',
      accountId: 'team_dummy',
    } as Awaited<ReturnType<typeof getProjectByNameOrId>>);
    client.stdin.isTTY = false;
    client.stdin.end(JSON.stringify(errorRateBody));
    client.setArgv(
      'metrics',
      '--body',
      '@-',
      '--project',
      'other-app',
      '--format=json'
    );

    const exitCode = await metrics(client);

    expect(exitCode).toBe(0);
    expect(postedBody?.scope).toEqual({
      ownerId: 'team_dummy',
      projectIds: ['prj_other'],
    });
  });

  it('prints a summary table with a column per output', async () => {
    client.setArgv('metrics', '--body', JSON.stringify(errorRateBody));

    const exitCode = await metrics(client);

    expect(exitCode).toBe(0);
    const out = stripAnsi(client.stdout.getFullOutput());
    expect(out).toMatch(/route\s+errorRate/);
    expect(out).toMatch(/\/api\/checkout\s+2\.5/);
    expect(out).toMatch(/\/api\/cart\s+-/);
  });

  it.each([
    [['vercel.request.count'], 'metric argument'],
    [['--group-by', 'route'], '--group-by'],
    [['--query', 'httpStatus >= 500'], '--query'],
    [['--environment', 'production'], '--environment'],
    [['--granularity', '1h'], '--granularity'],
  ])('rejects %j with --body', async (args, message) => {
    client.setArgv('metrics', ...args, '--body', JSON.stringify(errorRateBody));

    const exitCode = await metrics(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(message);
    expect(postedBody).toBeUndefined();
  });

  it('rejects --since when the body sets timeRange', async () => {
    client.setArgv(
      'metrics',
      '--body',
      JSON.stringify({
        ...errorRateBody,
        timeRange: { start: 'a', end: 'b' },
      }),
      '--since',
      '1h'
    );

    const exitCode = await metrics(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'when the body sets "timeRange"'
    );
    expect(postedBody).toBeUndefined();
  });

  it('reports invalid JSON as a JSON error', async () => {
    client.setArgv('metrics', '--body', '{not json', '--format=json');

    const exitCode = await metrics(client);

    expect(exitCode).toBe(2);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.error.code).toBe('INVALID_BODY');
    expect(postedBody).toBeUndefined();
  });

  it('lists --body in help', async () => {
    client.setArgv('metrics', '--help');

    const exitCode = await metrics(client);

    expect(exitCode).toBe(0);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toContain('--body');
    expect(out).toContain('"formulas":{"errorRate":"errors / total * 100"}');
  });
});
