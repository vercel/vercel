import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import query, {
  parseTimeFlag,
  resolveTimeRange,
  toGranularityDuration,
  toGranularityMs,
  computeGranularity,
  roundTimeBoundaries,
} from '../../../../src/commands/metrics/query';
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

  // ---- Time parsing unit tests ----

  describe('parseTimeFlag', () => {
    it('should parse relative 1h', () => {
      const now = Date.now();
      const result = parseTimeFlag('1h');
      const diff = now - result.getTime();
      // Should be approximately 1 hour (within 1 second tolerance)
      expect(diff).toBeGreaterThan(3599000);
      expect(diff).toBeLessThan(3601000);
    });

    it('should parse relative 30m', () => {
      const now = Date.now();
      const result = parseTimeFlag('30m');
      const diff = now - result.getTime();
      expect(diff).toBeGreaterThan(1799000);
      expect(diff).toBeLessThan(1801000);
    });

    it('should parse relative 2d', () => {
      const now = Date.now();
      const result = parseTimeFlag('2d');
      const diff = now - result.getTime();
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      expect(diff).toBeGreaterThan(twoDays - 1000);
      expect(diff).toBeLessThan(twoDays + 1000);
    });

    it('should parse relative 1w', () => {
      const now = Date.now();
      const result = parseTimeFlag('1w');
      const diff = now - result.getTime();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      expect(diff).toBeGreaterThan(oneWeek - 1000);
      expect(diff).toBeLessThan(oneWeek + 1000);
    });

    it('should parse ISO 8601 date', () => {
      const result = parseTimeFlag('2025-01-15T10:00:00Z');
      expect(result.toISOString()).toBe('2025-01-15T10:00:00.000Z');
    });

    it('should throw on invalid format', () => {
      expect(() => parseTimeFlag('invalid')).toThrow('Invalid time format');
    });
  });

  describe('resolveTimeRange', () => {
    it('should default to 1h ago to now', () => {
      const now = Date.now();
      const { startTime, endTime } = resolveTimeRange();
      const diff = now - startTime.getTime();
      expect(diff).toBeGreaterThan(3599000);
      expect(diff).toBeLessThan(3601000);
      expect(endTime.getTime()).toBeGreaterThan(now - 1000);
      expect(endTime.getTime()).toBeLessThanOrEqual(now + 1000);
    });

    it('should handle explicit since and until', () => {
      const { startTime, endTime } = resolveTimeRange(
        '2025-01-15T00:00:00Z',
        '2025-01-15T06:00:00Z'
      );
      expect(startTime.toISOString()).toBe('2025-01-15T00:00:00.000Z');
      expect(endTime.toISOString()).toBe('2025-01-15T06:00:00.000Z');
    });
  });

  // ---- Granularity unit tests ----

  describe('toGranularityDuration', () => {
    it('should convert 5m to { minutes: 5 }', () => {
      expect(toGranularityDuration('5m')).toEqual({ minutes: 5 });
    });

    it('should convert 1h to { hours: 1 }', () => {
      expect(toGranularityDuration('1h')).toEqual({ hours: 1 });
    });

    it('should convert 1d to { days: 1 }', () => {
      expect(toGranularityDuration('1d')).toEqual({ days: 1 });
    });

    it('should convert 4h to { hours: 4 }', () => {
      expect(toGranularityDuration('4h')).toEqual({ hours: 4 });
    });

    it('should throw on invalid format', () => {
      expect(() => toGranularityDuration('invalid')).toThrow(
        'Invalid granularity format'
      );
    });
  });

  describe('toGranularityMs', () => {
    it('should convert 5m to 300000', () => {
      expect(toGranularityMs('5m')).toBe(300000);
    });

    it('should convert 1h to 3600000', () => {
      expect(toGranularityMs('1h')).toBe(3600000);
    });
  });

  describe('computeGranularity', () => {
    it('should auto-select 1m for ≤1h range', () => {
      const result = computeGranularity(60 * 60 * 1000);
      expect(result.duration).toEqual({ minutes: 1 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 5m for ≤2h range', () => {
      const result = computeGranularity(2 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ minutes: 5 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 15m for ≤12h range', () => {
      const result = computeGranularity(12 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ minutes: 15 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 1h for ≤3d range', () => {
      const result = computeGranularity(3 * 24 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ hours: 1 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 4h for ≤30d range', () => {
      const result = computeGranularity(30 * 24 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ hours: 4 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 1d for >30d range', () => {
      const result = computeGranularity(31 * 24 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ days: 1 });
      expect(result.adjusted).toBe(false);
    });

    it('should adjust 5m to 4h on a 12-day range', () => {
      const rangeMs = 12 * 24 * 60 * 60 * 1000;
      const result = computeGranularity(rangeMs, '5m');
      expect(result.duration).toEqual({ hours: 4 });
      expect(result.adjusted).toBe(true);
      expect(result.notice).toContain('adjusted from 5m to 4h');
    });

    it('should not adjust when explicit is within range', () => {
      const rangeMs = 1 * 60 * 60 * 1000; // 1h
      const result = computeGranularity(rangeMs, '1m');
      expect(result.duration).toEqual({ minutes: 1 });
      expect(result.adjusted).toBe(false);
    });
  });

  describe('roundTimeBoundaries', () => {
    it('should floor start and ceil end to granularity', () => {
      const start = new Date('2025-01-15T10:03:00Z');
      const end = new Date('2025-01-15T10:58:00Z');
      const granMs = 15 * 60 * 1000; // 15m

      const { start: rounded_start, end: rounded_end } = roundTimeBoundaries(
        start,
        end,
        granMs
      );
      expect(rounded_start.toISOString()).toBe('2025-01-15T10:00:00.000Z');
      expect(rounded_end.toISOString()).toBe('2025-01-15T11:00:00.000Z');
    });
  });

  // ---- Integration tests for query subcommand ----

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
      expect(requestBody.rollups.value.measure).toBe('count');
      expect(requestBody.rollups.value.aggregation).toBe('sum');
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
      expect(requestBody.rollups.value.measure).toBe('requestDurationMs');
      expect(requestBody.rollups.value.aggregation).toBe('p95');
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
