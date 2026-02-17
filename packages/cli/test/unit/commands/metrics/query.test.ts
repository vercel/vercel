import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import query from '../../../../src/commands/metrics/query';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

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

function mockApiSuccess(data: any[] = [], summary: any[] = []) {
  client.scenario.post('/api/observability/metrics', (_req, res) => {
    res.json({
      data,
      summary,
      statistics: { rowsRead: 100 },
    });
  });
}

describe('query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('missing --event', () => {
    it('should return error with schema suggestion', async () => {
      mockLinkedProject();
      client.setArgv('metrics', 'query');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Missing required flag');
    });
  });

  describe('unknown event', () => {
    it('should return error with available events', async () => {
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'bogus');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown event "bogus"');
    });

    it('should return JSON error with --format=json', async () => {
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'bogus', '--format=json');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe('UNKNOWN_EVENT');
      expect(parsed.error.allowedValues).toContain('incomingRequest');
    });
  });

  describe('unknown measure', () => {
    it('should return error with available measures', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
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
        'incomingRequest',
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
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.count_sum.measure).toBe('count');
      expect(requestBody.rollups.count_sum.aggregation).toBe('sum');
    });

    it('should default to avg for duration measures', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'functionExecution',
        '--measure',
        'requestDurationMs'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.requestDurationMs_avg.measure).toBe(
        'requestDurationMs'
      );
      expect(requestBody.rollups.requestDurationMs_avg.aggregation).toBe('avg');
    });

    it('should default to sum for byte measures', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--measure',
        'fdtOutBytes'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.fdtOutBytes_sum.measure).toBe('fdtOutBytes');
      expect(requestBody.rollups.fdtOutBytes_sum.aggregation).toBe('sum');
    });
  });

  describe('unknown dimension', () => {
    it('should return error with --group-by bogus', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
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

  describe('filter-only dimension', () => {
    it('should return error for filter-only dimension in --group-by', async () => {
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'functionExecution',
        '--group-by',
        'provider'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('filter-only');
    });
  });

  describe('scope resolution', () => {
    it('should use linked project by default', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.scope).toEqual({
        type: 'project-with-slug',
        teamSlug: 'my-team',
        projectName: 'my-project',
      });
    });

    it('should use --project with team context', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockTeamScope('my-team');
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--project',
        'other-app'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.scope).toEqual({
        type: 'project-with-slug',
        teamSlug: 'my-team',
        projectName: 'other-app',
      });
    });

    it('should use --all with team context', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockTeamScope('my-team');
      client.setArgv('metrics', 'query', '--event', 'incomingRequest', '--all');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.scope).toEqual({
        type: 'team-with-slug',
        teamSlug: 'my-team',
      });
    });

    it('should error when both --all and --project', async () => {
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
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
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No linked project');
    });

    it('should return exitCode from getLinkedProject on error', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'error',
        exitCode: 1,
      });
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
    });

    it('should error when no team context with --all', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
        org: null as any,
        project: null as any,
      });
      mockedGetScope.mockResolvedValue({
        contextName: 'user',
        team: null,
        user: { id: 'user_dummy' } as any,
      });
      client.setArgv('metrics', 'query', '--event', 'incomingRequest', '--all');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No team context found');
    });
  });

  describe('CSV output', () => {
    it('should output ungrouped CSV', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.json({
          data: [
            { timestamp: '2025-01-15T10:00:00Z', value: 89 },
            { timestamp: '2025-01-15T10:05:00Z', value: 102 },
          ],
          summary: [{ value: 191 }],
          statistics: { rowsRead: 100 },
        });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('timestamp,count_sum');
    });

    it('should output grouped CSV', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.json({
          data: [
            {
              timestamp: '2025-01-15T10:00:00Z',
              httpStatus: '200',
              value: 4520,
            },
            {
              timestamp: '2025-01-15T10:00:00Z',
              httpStatus: '500',
              value: 89,
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
        'incomingRequest',
        '--group-by',
        'httpStatus'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('timestamp,httpStatus,count_sum');
    });

    it('should output header only for empty data', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('timestamp,count_sum');
    });
  });

  describe('JSON output', () => {
    it('should output full JSON structure with --format=json', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
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
        'incomingRequest',
        '--format=json'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.query.event).toBe('incomingRequest');
      expect(parsed.data).toHaveLength(1);
      expect(parsed.summary).toHaveLength(1);
      expect(parsed.statistics).toBeDefined();
    });
  });

  describe('--limit flag', () => {
    it('should send custom limit to API', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--limit',
        '50'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.limit).toBe(50);
    });
  });

  describe('--order-by flag', () => {
    it('should send order-by to API', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--order-by',
        'value:asc'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.orderBy).toBe('value:asc');
    });
  });

  describe('--filter flag', () => {
    it('should pass filter string to API', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--filter',
        'httpStatus ge 500'
      );

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      expect(requestBody.filter).toBe('httpStatus ge 500');
    });
  });

  describe('API errors', () => {
    it('should handle 402 payment required', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.status(402).json({ error: { code: 'PAYMENT_REQUIRED' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Observability Plus subscription'
      );
    });

    it('should handle 403 forbidden', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.status(403).json({ error: { code: 'FORBIDDEN' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('do not have permission');
    });

    it('should handle 500 internal error', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('internal error');
    });

    it('should handle 400 bad request', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res
          .status(400)
          .json({ error: { code: 'BAD_REQUEST', message: 'Invalid query' } });
      });
      mockLinkedProject();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      const exitCode = await query(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Invalid query');
    });

    it('should handle API error in JSON mode', async () => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.status(402).json({ error: { code: 'PAYMENT_REQUIRED' } });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
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
      client.setArgv('metrics', 'query', '--event', 'incomingRequest');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
      ]);
    });

    it('should track measure option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--measure',
        'requestDurationMs'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
        { key: 'option:measure', value: 'requestDurationMs' },
      ]);
    });

    it('should track aggregation option', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--measure',
        'requestDurationMs',
        '--aggregation',
        'p95'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
        { key: 'option:measure', value: 'requestDurationMs' },
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
        'incomingRequest',
        '--group-by',
        'httpStatus'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
        { key: 'option:group-by', value: 'httpStatus' },
      ]);
    });

    it('should track limit option as redacted', async () => {
      mockApiSuccess();
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--limit',
        '50'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
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
        'incomingRequest',
        '--filter',
        'httpStatus ge 500'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
        { key: 'option:filter', value: '[REDACTED]' },
      ]);
    });

    it('should track --all flag', async () => {
      mockApiSuccess();
      mockTeamScope();
      client.setArgv('metrics', 'query', '--event', 'incomingRequest', '--all');

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
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
        'incomingRequest',
        '--format=json'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
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
        'incomingRequest',
        '--granularity',
        '5m'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
        { key: 'option:granularity', value: '5m' },
      ]);
    });

    it('should track project option as redacted', async () => {
      mockApiSuccess();
      mockTeamScope();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--project',
        'my-app'
      );

      await query(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
        { key: 'option:project', value: '[REDACTED]' },
      ]);
    });
  });

  describe('request body', () => {
    it('should send correct request structure', async () => {
      let requestBody: any;
      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({ data: [], summary: [], statistics: {} });
      });
      mockLinkedProject();
      client.setArgv(
        'metrics',
        'query',
        '--event',
        'incomingRequest',
        '--measure',
        'requestDurationMs',
        '--aggregation',
        'p95',
        '--group-by',
        'httpStatus',
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
      expect(requestBody.rollups.requestDurationMs_p95.measure).toBe(
        'requestDurationMs'
      );
      expect(requestBody.rollups.requestDurationMs_p95.aggregation).toBe('p95');
      expect(requestBody.groupBy).toEqual(['httpStatus']);
      expect(requestBody.granularity).toEqual({ minutes: 15 });
      expect(requestBody.limitRanking).toBe('top_by_summary');
      expect(requestBody.tailRollup).toBe('truncate');
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
