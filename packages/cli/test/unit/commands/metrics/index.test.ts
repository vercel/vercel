import { describe, beforeEach, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import metrics from '../../../../src/commands/metrics';
import * as linkModule from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

describe('metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default mock for linked project
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'prj_123',
        name: 'my-project',
        accountId: 'org_123',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'org_123', slug: 'my-org', type: 'team' },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('help', () => {
    it('should show main help with --help flag', async () => {
      client.setArgv('metrics', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput('Query observability metrics');
    });

    it('should show query help with query --help', async () => {
      client.setArgv('metrics', 'query', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput('Run an observability query');
    });
  });

  describe('query validation', () => {
    it('should error when --event is missing', async () => {
      client.setArgv('metrics', '--by', 'errorCode');

      const exitCodePromise = metrics(client);

      await expect(client.stderr).toOutput('Missing required flag --event');
      expect(await exitCodePromise).toBe(1);
    });

    it('should error on unknown event', async () => {
      client.setArgv('metrics', '-e', 'unknownEvent');

      const exitCodePromise = metrics(client);

      await expect(client.stderr).toOutput(
        'Error: Unknown event "unknownEvent"'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error on unknown dimension', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '--by',
        'unknownDimension'
      );

      const exitCodePromise = metrics(client);

      await expect(client.stderr).toOutput(
        'Dimension "unknownDimension" is not available'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error on invalid aggregation for measure', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '-m',
        'count',
        '-a',
        'p99'
      );

      const exitCodePromise = metrics(client);

      await expect(client.stderr).toOutput(
        'Aggregation "p99" is not valid for measure "count"'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('query execution', () => {
    let requestBody: any;

    beforeEach(() => {
      requestBody = undefined;

      client.scenario.post('/api/observability/metrics', (req, res) => {
        requestBody = req.body;
        res.json({
          summary: [
            { errorCode: 'FUNCTION_INVOCATION_TIMEOUT', value: 1234 },
            { errorCode: 'FUNCTION_PAYLOAD_TOO_LARGE', value: 567 },
          ],
          data: [],
          statistics: {
            totalGroups: 2,
            totalValue: 1801,
          },
        });
      });
    });

    it('should make API call with correct query structure', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '--status',
        '5xx',
        '--by',
        'errorCode',
        '--since',
        '1h'
      );

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      expect(requestBody).toBeDefined();
      expect(requestBody.event).toBe('incomingRequest');
      expect(requestBody.groupBy).toEqual(['errorCode']);
      expect(requestBody.filter).toContain('httpStatus ge 500');
      expect(requestBody.rollups.value.measure).toBe('count');
      expect(requestBody.rollups.value.aggregation).toBe('sum');
    });

    it('should output table by default', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '--status',
        '5xx',
        '--by',
        'errorCode',
        '--since',
        '1h'
      );

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      // Check the full output contains expected content
      const output = client.stderr.getFullOutput();
      expect(output).toContain('ERRORCODE');
      expect(output).toContain('VALUE');
      expect(output).toContain('FUNCTION_INVOCATION_TIMEOUT');
    });

    it('should output JSON with --json flag', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '--status',
        '5xx',
        '--by',
        'errorCode',
        '--json'
      );

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.query.event).toBe('incomingRequest');
      expect(parsed.summary).toHaveLength(2);
      expect(parsed.statistics.totalValue).toBe(1801);
    });

    it('should support custom measure and aggregation', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '-m',
        'requestDurationMs',
        '-a',
        'p95',
        '--by',
        'route'
      );

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      expect(requestBody.rollups.value.measure).toBe('requestDurationMs');
      expect(requestBody.rollups.value.aggregation).toBe('p95');
    });

    it('should combine multiple filter shortcuts', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '--status',
        '5xx',
        '--path',
        '/api',
        '--method',
        'POST',
        '--region',
        'iad1'
      );

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      expect(requestBody.filter).toContain('httpStatus ge 500');
      expect(requestBody.filter).toContain("contains(requestPath, '/api')");
      expect(requestBody.filter).toContain("requestMethod eq 'POST'");
      expect(requestBody.filter).toContain("edgeNetworkRegion eq 'iad1'");
    });
  });

  describe('project resolution', () => {
    it('should error when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });

      client.setArgv('metrics', '-e', 'incomingRequest');

      const exitCodePromise = metrics(client);

      await expect(client.stderr).toOutput("isn't linked to a project");
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('telemetry', () => {
    beforeEach(() => {
      client.scenario.post('/api/observability/metrics', (_req, res) => {
        res.json({
          summary: [],
          data: [],
          statistics: { totalGroups: 0, totalValue: 0 },
        });
      });
    });

    it('should track telemetry for query options', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '--status',
        '5xx',
        '--by',
        'errorCode',
        '--since',
        '1h'
      );

      await metrics(client);

      const events = client.telemetryEventStore.readonlyEvents;
      expect(
        events.some(
          e => e.key === 'option:event' && e.value === 'incomingRequest'
        )
      ).toBe(true);
      expect(
        events.some(e => e.key === 'option:status' && e.value === '5xx')
      ).toBe(true);
      expect(
        events.some(e => e.key === 'option:by' && e.value === 'errorCode')
      ).toBe(true);
      expect(
        events.some(e => e.key === 'option:since' && e.value === '1h')
      ).toBe(true);
    });

    it('should redact sensitive values', async () => {
      client.setArgv(
        'metrics',
        '-e',
        'incomingRequest',
        '--path',
        '/api/secret',
        '--filter',
        'secret eq true'
      );

      await metrics(client);

      const events = client.telemetryEventStore.readonlyEvents;
      expect(
        events.some(e => e.key === 'option:path' && e.value === '[REDACTED]')
      ).toBe(true);
      expect(
        events.some(e => e.key === 'option:filter' && e.value === '[REDACTED]')
      ).toBe(true);
    });
  });
});
