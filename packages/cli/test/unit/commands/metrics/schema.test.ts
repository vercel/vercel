import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import schema from '../../../../src/commands/metrics/schema';
import { MetricsTelemetryClient } from '../../../../src/util/telemetry/commands/metrics';
import getScope from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/get-scope');

class MockTelemetry extends MetricsTelemetryClient {
  constructor() {
    super({
      opts: {
        store: client.telemetryEventStore,
      },
    });
  }
}

const mockedGetScope = vi.mocked(getScope);

function mockSchemaApi() {
  client.scenario.get('/v1/observability/schema', (_req, res) => {
    res.json({
      events: [
        { name: 'incomingRequest', description: 'Edge Requests' },
        { name: 'functionExecution', description: 'Function Executions' },
      ],
    });
  });

  client.scenario.get(
    '/v1/observability/schema/incomingRequest',
    (_req, res) => {
      res.json({
        name: 'incomingRequest',
        description: 'Edge Requests',
        dimensions: [{ name: 'httpStatus', label: 'HTTP Status' }],
        measures: [
          {
            name: 'count',
            label: 'Count',
            unit: 'count',
            aggregations: ['sum', 'persecond', 'percent'],
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
        description: 'Function Executions',
        dimensions: [],
        measures: [],
      });
    }
  );
}

describe('schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' } as any,
      user: { id: 'user_dummy' } as any,
    });
    mockSchemaApi();
  });

  describe('event list', () => {
    it('should output table list of events', async () => {
      client.setArgv('metrics', 'schema');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).toContain('Events found');
      expect(stderrOutput).toContain('Event');
      expect(stderrOutput).toContain('Description');
      expect(stderrOutput).toContain('vercel.edge_request');
    });

    it('should output JSON list with --format=json', async () => {
      client.setArgv('metrics', 'schema', '--format=json');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty('name');
      expect(parsed[0]).toHaveProperty('description');
    });
  });

  describe('event detail', () => {
    it('should output table detail for a known event', async () => {
      client.setArgv('metrics', 'schema', '--event', 'vercel.edge_request');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).toContain('Event: vercel.edge_request');
      expect(stderrOutput).toContain('Dimension');
      expect(stderrOutput).toContain('Label');
      expect(stderrOutput).toContain('Measure');
      expect(stderrOutput).toContain('Unit');
    });

    it('should output JSON detail with --format=json', async () => {
      client.setArgv(
        'metrics',
        'schema',
        '--event',
        'vercel.edge_request',
        '--format=json'
      );

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.event).toBe('vercel.edge_request');
      expect(parsed.description).toBeDefined();
      expect(parsed.dimensions).toBeDefined();
      expect(parsed.measures).toBeDefined();
      expect(parsed.measures[0].aggregations).toEqual([
        'sum',
        'persecond',
        'percent',
      ]);
    });
  });

  describe('unknown event', () => {
    it('should return error for unknown event', async () => {
      client.setArgv('metrics', 'schema', '--event', 'bogus');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown event "bogus"');
    });

    it('should return JSON error with --format=json', async () => {
      client.setArgv('metrics', 'schema', '--event', 'bogus', '--format=json');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(1);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe('UNKNOWN_EVENT');
      expect(parsed.error.allowedValues).toContain('vercel.edge_request');
    });
  });

  describe('telemetry', () => {
    it('should track event option', async () => {
      client.setArgv('metrics', 'schema', '--event', 'vercel.edge_request');

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'vercel.edge_request' },
      ]);
    });

    it('should track format option', async () => {
      client.setArgv('metrics', 'schema', '--format=json');

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:format', value: 'json' },
      ]);
    });
  });
});
