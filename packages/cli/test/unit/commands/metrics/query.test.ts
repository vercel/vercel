import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import query from '../../../../src/commands/metrics/query';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import getProjectByNameOrId from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);
const mockedGetProjectByNameOrId = vi.mocked(getProjectByNameOrId);

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
    team: { id: 'team_dummy', slug: teamSlug } as any,
    user: { id: 'user_dummy' } as any,
  });
}

function mockProjectLookup(projectName = 'other-app', projectId = 'prj_other') {
  mockedGetProjectByNameOrId.mockResolvedValue({
    id: projectId,
    name: projectName,
    accountId: 'team_dummy',
  } as any);
}

function mockApiSuccess(data: any[] = [], summary: any[] = []) {
  client.scenario.post('/v1/observability/query', (_req, res) => {
    res.json({
      data,
      summary,
      statistics: { rowsRead: 100 },
    });
  });
}

function mockSchemaApi() {
  client.scenario.get('/v1/observability/schema', (_req, res) => {
    res.json({
      events: [
        { name: 'incomingRequest', description: 'Edge Requests' },
        { name: 'functionExecution', description: 'Functions' },
      ],
    });
  });

  client.scenario.get(
    '/v1/observability/schema/incomingRequest',
    (_req, res) => {
      res.json({
        name: 'incomingRequest',
        description: 'Edge Requests',
        dimensions: [
          { name: 'httpStatus', label: 'HTTP Status' },
          { name: 'route', label: 'Route' },
        ],
        measures: [
          {
            name: 'count',
            label: 'Count',
            unit: 'count',
            aggregations: ['sum', 'persecond', 'percent'],
            defaultAggregation: 'sum',
          },
          {
            name: 'requestDurationMs',
            label: 'Request Duration',
            unit: 'milliseconds',
            aggregations: ['avg', 'min', 'max', 'p95'],
            defaultAggregation: 'avg',
          },
          {
            name: 'fdtOutBytes',
            label: 'Bandwidth',
            unit: 'bytes',
            aggregations: ['sum', 'avg'],
            defaultAggregation: 'sum',
          },
        ],
      });
    }
  );

  client.scenario.get(
    '/v1/observability/schema/functionExecution',
    (_req, res) => {
      res.json({
        name: 'functionExecution',
        description: 'Functions',
        dimensions: [{ name: 'route', label: 'Route' }],
        measures: [
          {
            name: 'count',
            label: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
          {
            name: 'requestDurationMs',
            label: 'Request Duration',
            unit: 'milliseconds',
            aggregations: ['avg', 'p95'],
            defaultAggregation: 'avg',
          },
        ],
      });
    }
  );
}

describe('query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedGetProjectByNameOrId.mockReset();
    mockSchemaApi();
  });

  describe('missing --event', () => {
    it('should return error with schema suggestion', async () => {
      mockLinkedProject();
      client.setArgv('metrics');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Missing required flag');
    });
  });

  describe('unknown event', () => {
    it('should return error with available events', async () => {
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'bogus');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown event "bogus"');
    });

    it('should return JSON error with --format=json', async () => {
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'bogus', '--format=json');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe('UNKNOWN_EVENT');
      expect(parsed.error.allowedValues).toContain('vercel.edge_request');
    });
  });

  describe('unknown measure', () => {
    it('should return error with available measures', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--measure',
        'bogus'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Measure "bogus" is not available'
      );
    });
  });

  describe('invalid aggregation', () => {
    it('should return error with valid aggregations', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--measure',
        'count',
        '--aggregation',
        'p95'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Aggregation "p95" is not valid'
      );
    });
  });

  describe('default measure and aggregation', () => {
    it('should default to count/sum', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.count_sum.measure).toBe('count');
      expect(requestBody.rollups.count_sum.aggregation).toBe('sum');
    });

    it('should default to avg for duration measures', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.function_execution',
        '--measure',
        'request_duration_ms'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.request_duration_ms_avg.measure).toBe(
        'requestDurationMs'
      );
      expect(requestBody.rollups.request_duration_ms_avg.aggregation).toBe(
        'avg'
      );
    });

    it('should default to sum for byte measures', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--measure',
        'fdt_out_bytes'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.fdt_out_bytes_sum.measure).toBe('fdtOutBytes');
      expect(requestBody.rollups.fdt_out_bytes_sum.aggregation).toBe('sum');
    });
  });

  describe('embedded measure in --event', () => {
    it('should resolve event and measure from shorthand', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        '--event',
        'vercel.edge_request.request_duration_ms',
        '--aggregation',
        'avg'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.request_duration_ms_avg.measure).toBe(
        'requestDurationMs'
      );
      expect(requestBody.rollups.request_duration_ms_avg.aggregation).toBe(
        'avg'
      );
    });

    it('should error when both embedded measure and --measure are provided', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        '--event',
        'vercel.edge_request.count',
        '--measure',
        'request_duration_ms'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Cannot specify --measure when the event already includes a measure'
      );
    });

    it('should return JSON error for conflict with --format=json', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        '--event',
        'vercel.edge_request.count',
        '--measure',
        'request_duration_ms',
        '--format=json'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe('MEASURE_CONFLICT');
    });
  });

  describe('unknown dimension', () => {
    it('should return error with --group-by bogus', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--group-by',
        'bogus'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Dimension "bogus" is not available'
      );
    });
  });

  describe('scope resolution', () => {
    it('should use linked project by default', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_metricstest'],
      });
    });

    it('should use --project with team context', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockTeamScope('my-team');
      mockProjectLookup('other-app');
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--project',
        'other-app'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_other'],
      });
    });

    it('should resolve a project ID passed to --project', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockTeamScope('my-team');
      mockedGetProjectByNameOrId.mockResolvedValue({
        id: 'prj_direct',
        name: 'other-app',
        accountId: 'team_dummy',
      } as any);
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
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
      expect(requestBody.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_direct'],
      });
    });

    it('should use --all with team context', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockTeamScope('my-team');
      client.setArgv('metrics', '--event', 'vercel.edge_request', '--all');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.scope).toEqual({
        type: 'owner',
        ownerId: 'team_dummy',
      });
    });

    it('should error when both --all and --project', async () => {
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
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
        org: null as any,
        project: null as any,
      });
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No linked project');
    });

    it('should return exitCode from getLinkedProject on error', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'error',
        exitCode: 1,
      });
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
    });

    it('should error when no team context with --all', async () => {
      mockedGetScope.mockResolvedValue({
        contextName: 'user',
        team: null,
        user: { id: 'user_dummy' } as any,
      });
      client.setArgv('metrics', '--event', 'vercel.edge_request', '--all');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No team context found');
    });

    it('should error when no team context with --project', async () => {
      mockedGetScope.mockResolvedValue({
        contextName: 'user',
        team: null,
        user: { id: 'user_dummy' } as any,
      });
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--project',
        'my-app'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No team context found');
    });

    it('should use getScope team for --project even when linked to a different team', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject(); // linked to 'my-team'
      mockTeamScope('other-team'); // getScope returns 'other-team'
      mockedGetProjectByNameOrId.mockResolvedValue({
        id: 'prj_other_team',
        name: 'other-app',
        accountId: 'team_dummy',
      } as any);
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--project',
        'other-app'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_other_team'],
      });
    });
  });

  describe('text output', () => {
    it('should output ungrouped text', async () => {
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.json({
          data: [
            { timestamp: '2025-01-15T10:00:00Z', count_sum: 89 },
            { timestamp: '2025-01-15T10:05:00Z', count_sum: 102 },
          ],
          summary: [{ count_sum: 191 }],
          statistics: { rowsRead: 100 },
        });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('> Metric:');
      expect(output).toContain('sparklines:');
    });

    it('should output grouped text', async () => {
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.json({
          data: [
            {
              timestamp: '2025-01-15T10:00:00Z',
              httpStatus: '200',
              count_sum: 4520,
            },
            {
              timestamp: '2025-01-15T10:00:00Z',
              httpStatus: '500',
              count_sum: 89,
            },
          ],
          summary: [],
          statistics: { rowsRead: 100 },
        });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
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
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

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
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.json({
          data: [{ timestamp: '2025-01-15T10:00:00Z', value: 42 }],
          summary: [{ value: 42 }],
          statistics: { rowsRead: 100 },
        });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--format=json'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.query.event).toBe('vercel.edge_request');
      expect(parsed.data).toHaveLength(1);
      expect(parsed.summary).toHaveLength(1);
      expect(parsed.statistics).toBeDefined();
    });
  });

  describe('--limit flag', () => {
    it('should send custom limit to API', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--limit',
        '50'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.limit).toBe(50);
    });
  });

  describe('--filter flag', () => {
    it('should pass filter string to API', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--filter',
        'http_status ge 500'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.filter).toBe('httpStatus ge 500');
    });

    it('should not rewrite dimension names inside quoted strings', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--filter',
        "contains(route, '/http_status') and http_status ge 500"
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.filter).toBe(
        "contains(route, '/http_status') and httpStatus ge 500"
      );
    });
  });

  describe('API errors', () => {
    it('should handle 402 payment required', async () => {
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.status(402).json({ error: { code: 'PAYMENT_REQUIRED' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Observability Plus subscription'
      );
    });

    it('should handle 403 forbidden', async () => {
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.status(403).json({ error: { code: 'FORBIDDEN' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('do not have permission');
    });

    it('should handle 500 internal error', async () => {
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('internal error');
    });

    it('should handle 400 bad request', async () => {
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res
          .status(400)
          .json({ error: { code: 'BAD_REQUEST', message: 'Invalid query' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Invalid query');
    });

    it('should handle API error in JSON mode', async () => {
      client.scenario.post('/v1/observability/query', (_req, res) => {
        res.status(402).json({ error: { code: 'PAYMENT_REQUIRED' } });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--format=json'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe('PAYMENT_REQUIRED');
    });
  });

  describe('telemetry', () => {
    it('should track event option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv('metrics', '--event', 'vercel.edge_request');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
      ]);
    });

    it('should track measure option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--measure',
        'request_duration_ms'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:measure', value: 'request_duration_ms' },
      ]);
    });

    it('should track aggregation option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--measure',
        'request_duration_ms',
        '--aggregation',
        'p95'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:measure', value: 'request_duration_ms' },
        { key: 'option:aggregation', value: 'p95' },
      ]);
    });

    it('should track group-by option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--group-by',
        'http_status'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:group-by', value: 'http_status' },
      ]);
    });

    it('should track limit option as redacted', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--limit',
        '50'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:limit', value: '[REDACTED]' },
      ]);
    });

    it('should track filter option as redacted', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--filter',
        'http_status ge 500'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:filter', value: '[REDACTED]' },
      ]);
    });

    it('should track --all flag', async () => {
      mockApiSuccess();
      mockTeamScope();
      client.setArgv('metrics', '--event', 'vercel.edge_request', '--all');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'flag:all', value: 'TRUE' },
      ]);
    });

    it('should track format option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--format=json'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:format', value: 'json' },
      ]);
    });

    it('should track granularity option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--granularity',
        '5m'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:granularity', value: '5m' },
      ]);
    });

    it('should track project option as redacted', async () => {
      mockApiSuccess();
      mockTeamScope();
      mockProjectLookup('my-app', 'prj_my_app');
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--project',
        'my-app'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
        { key: 'option:project', value: '[REDACTED]' },
      ]);
    });
  });

  describe('request body', () => {
    it('should send correct request structure', async () => {
      let requestBody: any;
      client.scenario.post('/v1/observability/query', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'vercel.edge_request',
        '--measure',
        'request_duration_ms',
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
      expect(requestBody.reason).toBe('agent');
      expect(requestBody.event).toBe('incomingRequest');
      expect(requestBody.rollups.request_duration_ms_p95.measure).toBe(
        'requestDurationMs'
      );
      expect(requestBody.rollups.request_duration_ms_p95.aggregation).toBe(
        'p95'
      );
      expect(requestBody.groupBy).toEqual(['httpStatus']);
      expect(requestBody.granularity).toEqual({ minutes: 15 });
    });
  });
});

// Minimal mock telemetry client for testing
import { MetricsTelemetryClient } from '../../../../src/util/telemetry/commands/metrics';

class MockTelemetry extends MetricsTelemetryClient {
  constructor() {
    super({
      opts: {
        store: client.telemetryEventStore,
      },
    });
  }
}
