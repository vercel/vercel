import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import query from '../../../../src/commands/metrics/query';
import { MetricsTelemetryClient } from '../../../../src/util/telemetry/commands/metrics';
import * as linkModule from '../../../../src/util/projects/link';
import getScope from '../../../../src/util/get-scope';
import getProjectByNameOrId from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScope);
const mockedGetProjectByNameOrId = vi.mocked(getProjectByNameOrId);
type ScopeResult = Awaited<ReturnType<typeof getScope>>;
type ProjectLookupResult = Awaited<ReturnType<typeof getProjectByNameOrId>>;
let postedBody: Record<string, unknown> | undefined;

class MockTelemetry extends MetricsTelemetryClient {
  constructor() {
    super({ opts: { store: client.telemetryEventStore } });
  }
}

function mockLinkedProject() {
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
}

function mockTeamScope(teamSlug = 'my-team') {
  mockedGetScope.mockResolvedValue({
    contextName: teamSlug,
    team: { id: 'team_dummy', slug: teamSlug },
    user: { id: 'user_dummy' },
  } as ScopeResult);
}

function mockUserScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'user',
    team: null,
    user: { id: 'user_dummy' },
  } as ScopeResult);
}

function mockProjectLookup(projectName = 'other-app', projectId = 'prj_other') {
  mockedGetProjectByNameOrId.mockResolvedValue({
    id: projectId,
    name: projectName,
    accountId: 'team_dummy',
  } as ProjectLookupResult);
}

function mockMetricDetail(
  metricId = 'vercel.request.count',
  overrides: Partial<{
    description: string;
    unit: string;
    aggregations: string[];
    defaultAggregation: string;
    dimensions: Array<{ name: string; label: string }>;
  }> = {}
) {
  client.scenario.get(
    `/v2/observability/schema/${encodeURIComponent(metricId)}`,
    (_req, res) => {
      res.json([
        {
          id: metricId,
          description: overrides.description ?? 'Count',
          dimensions: overrides.dimensions ?? [
            { name: 'http_status', label: 'HTTP Status' },
            { name: 'route', label: 'Route' },
            { name: 'request_path', label: 'Request Path' },
          ],
          unit: overrides.unit ?? 'count',
          aggregations: overrides.aggregations ?? [
            'sum',
            'persecond',
            'percent',
            'unique',
          ],
          defaultAggregation: overrides.defaultAggregation ?? 'sum',
        },
      ]);
    }
  );
}

function mockApiSuccess(
  data: Record<string, unknown>[] = [],
  summary: Record<string, unknown>[] = []
) {
  client.scenario.post('/v2/observability/query', (req, res) => {
    postedBody =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body as Record<string, unknown>);
    res.json({
      data,
      summary,
      statistics: { rowsRead: 100 },
    });
  });
}

describe('metrics query v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    postedBody = undefined;
    mockedGetProjectByNameOrId.mockReset();
    mockLinkedProject();
    mockTeamScope();
  });

  describe('missing metric', () => {
    it('should return error with schema suggestion', async () => {
      client.setArgv('metrics');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Missing required metric'
      );
    });
  });

  describe('positional metric', () => {
    it('should accept a positional metric id', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count', '--since', '1h');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.metric).toBe('vercel.request.count');
    });
  });

  describe('metric validation', () => {
    it('should return error with available metrics', async () => {
      client.scenario.get('/v2/observability/schema/bogus', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'unknown_metric',
            message: 'Unknown metric "bogus".',
            allowedValues: ['vercel.request.count'],
          },
        });
      });
      client.setArgv('metrics', 'bogus');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown metric "bogus"');
      expect(client.stderr.getFullOutput()).toContain(
        'Available values: vercel.request.count'
      );
    });

    it('should return JSON error with --format=json', async () => {
      client.scenario.get('/v2/observability/schema/bogus', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'unknown_metric',
            message: 'Unknown metric "bogus".',
            allowedValues: ['vercel.request.count'],
          },
        });
      });
      client.setArgv('metrics', 'bogus', '--format=json');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe('unknown_metric');
      expect(parsed.error.allowedValues).toContain('vercel.request.count');
    });

    it('should return error for a non-queryable metric with available values', async () => {
      client.scenario.get(
        '/v2/observability/schema/vercel.request',
        (_req, res) => {
          res.json([
            {
              id: 'vercel.request.count',
              description: 'Count',
              dimensions: [{ name: 'route', label: 'Route' }],
              unit: 'count',
              aggregations: ['sum'],
              defaultAggregation: 'sum',
            },
          ]);
        }
      );
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'metric_not_queryable',
            message: 'Metric "vercel.request" is not directly queryable.',
            allowedValues: ['vercel.request.count'],
          },
        });
      });
      client.setArgv('metrics', 'vercel.request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('not directly queryable');
      expect(client.stderr.getFullOutput()).toContain(
        'Available values: vercel.request.count'
      );
    });
  });

  describe('default aggregation', () => {
    it('should default to sum for count metrics', async () => {
      mockMetricDetail('vercel.request.count', {
        unit: 'count',
        defaultAggregation: 'sum',
      });
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.metric).toBe('vercel.request.count');
      expect(postedBody?.aggregation).toBe('sum');
    });

    it('should default to avg for duration metrics', async () => {
      mockMetricDetail('vercel.function_invocation.request_duration_ms', {
        description: 'Request Duration',
        unit: 'milliseconds',
        aggregations: ['avg', 'p95'],
        defaultAggregation: 'avg',
      });
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.function_invocation.request_duration_ms'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.aggregation).toBe('avg');
    });

    it('should default to sum for byte metrics', async () => {
      mockMetricDetail('vercel.request.fdt_out_bytes', {
        description: 'Bandwidth',
        unit: 'bytes',
        aggregations: ['sum', 'avg'],
        defaultAggregation: 'sum',
      });
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.fdt_out_bytes');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.aggregation).toBe('sum');
    });
  });

  describe('API validation errors', () => {
    it('should show available aggregations when the API rejects an aggregation', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_aggregation',
            message:
              'Aggregation "median" is not valid for metric "vercel.request.count".',
            allowedValues: ['sum'],
          },
        });
      });
      client.setArgv('metrics', 'vercel.request.count', '-a', 'median');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Available values: sum');
    });

    it('should show available dimensions when the API rejects a groupBy dimension', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_dimension',
            message:
              'Group by uses invalid dimension "not_a_dimension" for metric "vercel.request.count".',
            allowedValues: ['route', 'request_path'],
          },
        });
      });
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--group-by',
        'not_a_dimension'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Available values: route, request_path'
      );
    });
  });

  describe('scope resolution', () => {
    it('should use linked project by default', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_metricstest'],
      });
    });

    it('should use --project with team context', async () => {
      mockMetricDetail();
      mockTeamScope('my-team');
      mockProjectLookup('other-app');
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--project',
        'other-app'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_other'],
      });
    });

    it('should resolve a project ID passed to --project', async () => {
      mockMetricDetail();
      mockTeamScope('my-team');
      mockedGetProjectByNameOrId.mockResolvedValue({
        id: 'prj_direct',
        name: 'other-app',
        accountId: 'team_dummy',
      } as ProjectLookupResult);
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--project',
        'prj_direct'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(mockedGetProjectByNameOrId).toHaveBeenCalledWith(
        client,
        'prj_direct',
        'team_dummy'
      );
      expect(postedBody?.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_direct'],
      });
    });

    it('should use --all with team context', async () => {
      mockMetricDetail();
      mockTeamScope('my-team');
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count', '--all');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.scope).toEqual({
        type: 'owner',
        ownerId: 'team_dummy',
      });
    });

    it('should error when both --all and --project', async () => {
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--all',
        '--project',
        'my-app'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Cannot specify both --all and --project'
      );
    });

    it('should error when not linked and no project flag', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No linked project');
    });

    it('should return exitCode from getLinkedProject on error', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'error',
        exitCode: 1,
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
    });

    it('should error when no team context with --all', async () => {
      mockUserScope();
      client.setArgv('metrics', 'vercel.request.count', '--all');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No team context found');
    });

    it('should error when no team context with --project', async () => {
      mockUserScope();
      client.setArgv('metrics', 'vercel.request.count', '--project', 'my-app');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No team context found');
    });

    it('should use getScope team for --project even when linked to a different team', async () => {
      mockMetricDetail();
      mockLinkedProject();
      mockTeamScope('other-team');
      mockedGetProjectByNameOrId.mockResolvedValue({
        id: 'prj_other_team',
        name: 'other-app',
        accountId: 'team_dummy',
      } as ProjectLookupResult);
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--project',
        'other-app'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_other_team'],
      });
    });
  });

  describe('text output', () => {
    it('should output ungrouped text', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.json({
          data: [
            {
              timestamp: '2025-01-15T10:00:00Z',
              vercel_request_count_sum: 89,
            },
            {
              timestamp: '2025-01-15T10:05:00Z',
              vercel_request_count_sum: 102,
            },
          ],
          summary: [{ vercel_request_count_sum: 191 }],
          statistics: { rowsRead: 100 },
        });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('> Metric:');
      expect(output).toContain('sparklines:');
    });

    it('should output grouped text', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.json({
          data: [
            {
              timestamp: '2025-01-15T10:00:00Z',
              http_status: '200',
              vercel_request_count_sum: 4520,
            },
            {
              timestamp: '2025-01-15T10:00:00Z',
              http_status: '500',
              vercel_request_count_sum: 89,
            },
          ],
          summary: [],
          statistics: { rowsRead: 100 },
        });
      });
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--group-by',
        'http_status'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('http_status');
      expect(output).toContain('sparklines:');
      expect(output).toContain('> Groups:');
    });

    it('should output no-data message for empty data', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.json({ data: [], summary: [], statistics: {} });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('> Metric:');
      expect(output).toContain('No data');
      expect(output).not.toContain('sparklines:');
    });
  });

  describe('JSON output', () => {
    it('should output full JSON structure with --format=json', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.json({
          data: [{ timestamp: '2025-01-15T10:00:00Z', value: 42 }],
          summary: [{ value: 42 }],
          statistics: { rowsRead: 100 },
        });
      });
      client.setArgv('metrics', 'vercel.request.count', '--format=json');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.query.metric).toBe('vercel.request.count');
      expect(parsed.data).toHaveLength(1);
      expect(parsed.summary).toHaveLength(1);
      expect(parsed.statistics).toBeDefined();
    });
  });

  describe('--limit flag', () => {
    it('should send custom limit to API', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count', '--limit', '50');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.limit).toBe(50);
    });
  });

  describe('--filter flag', () => {
    it('should pass filter string to API', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--filter',
        'http_status ge 500'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.filter).toBe('http_status ge 500');
    });
  });

  describe('API errors', () => {
    it('should handle 402 payment required', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(402).json({
          error: {
            code: 'PAYMENT_REQUIRED',
            message:
              'This feature requires an Observability Plus subscription. Upgrade at https://vercel.com/dashboard/settings/billing',
          },
        });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Observability Plus subscription'
      );
    });

    it('should surface the API quota message for 402 responses', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(402).json({
          error: {
            code: 'payment_required',
            message:
              'You have reached the daily observability metrics query limit for your team. Request a higher usage limit from your Vercel account team.',
          },
        });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'You have reached the daily observability metrics query limit'
      );
    });

    it('should handle 403 forbidden', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(403).json({ error: { code: 'FORBIDDEN' } });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('do not have permission');
    });

    it('should handle 500 internal error', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('internal error');
    });

    it('should handle 400 bad request', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res
          .status(400)
          .json({ error: { code: 'BAD_REQUEST', message: 'Invalid query' } });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Invalid query');
    });

    it('should show a friendly message for 429 responses', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(429).json({
          error: {
            code: 'rate_limited',
            message:
              'Too many requests. Please wait and try again. If you need a higher limit, request one from your Vercel account team.',
          },
        });
      });
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Too many requests. Please wait and try again.'
      );
    });

    it('should handle API error in JSON mode', async () => {
      mockMetricDetail();
      client.scenario.post('/v2/observability/query', (_req, res) => {
        res.status(402).json({ error: { code: 'PAYMENT_REQUIRED' } });
      });
      client.setArgv('metrics', 'vercel.request.count', '--format=json');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe('PAYMENT_REQUIRED');
    });
  });

  describe('telemetry', () => {
    it('should track metric argument', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
      ]);
    });

    it('should track aggregation option', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count', '--aggregation', 'p95');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'option:aggregation', value: 'p95' },
      ]);
    });

    it('should track group-by option', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--group-by',
        'http_status'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'option:group-by', value: 'http_status' },
      ]);
    });

    it('should track limit option as redacted', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count', '--limit', '50');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'option:limit', value: '[REDACTED]' },
      ]);
    });

    it('should track filter option as redacted', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--filter',
        'http_status ge 500'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'option:filter', value: '[REDACTED]' },
      ]);
    });

    it('should track --all flag', async () => {
      mockMetricDetail();
      mockApiSuccess();
      mockTeamScope();
      client.setArgv('metrics', 'vercel.request.count', '--all');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'flag:all', value: 'TRUE' },
      ]);
    });

    it('should track format option', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count', '--format=json');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'option:format', value: 'json' },
      ]);
    });

    it('should track granularity option', async () => {
      mockMetricDetail();
      mockApiSuccess();
      client.setArgv('metrics', 'vercel.request.count', '--granularity', '5m');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'option:granularity', value: '5m' },
      ]);
    });

    it('should track project option as redacted', async () => {
      mockMetricDetail();
      mockApiSuccess();
      mockTeamScope();
      mockProjectLookup('my-app', 'prj_my_app');
      client.setArgv('metrics', 'vercel.request.count', '--project', 'my-app');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
        { key: 'option:project', value: '[REDACTED]' },
      ]);
    });
  });

  describe('request body', () => {
    it('should send correct request structure', async () => {
      mockMetricDetail('vercel.request.route_cpu_duration_ms', {
        description: 'Request Duration',
        unit: 'milliseconds',
        aggregations: ['avg', 'p95'],
        defaultAggregation: 'avg',
      });
      mockApiSuccess();
      client.setArgv(
        'metrics',
        'vercel.request.route_cpu_duration_ms',
        '--aggregation',
        'p95',
        '--group-by',
        'http_status',
        '--since',
        '2025-01-15T00:00:00Z',
        '--until',
        '2025-01-15T06:00:00Z',
        '--granularity',
        '15m'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(postedBody?.metric).toBe('vercel.request.route_cpu_duration_ms');
      expect(postedBody?.aggregation).toBe('p95');
      expect(postedBody?.groupBy).toEqual(['http_status']);
      expect(postedBody?.granularity).toEqual({ minutes: 15 });
    });
  });
});
