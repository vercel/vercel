import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import schema from '../../../../src/commands/metrics/schema';
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

describe('schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('event list', () => {
    it('should output CSV list of events', async () => {
      client.setArgv('metrics', 'schema');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('event,description');
      expect(output).toContain('incomingRequest');
      expect(output).toContain('functionExecution');
    });

    it('should output JSON list with --format=json', async () => {
      client.setArgv('metrics', 'schema', '--format=json');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(24);
      expect(parsed[0]).toHaveProperty('name');
      expect(parsed[0]).toHaveProperty('description');
    });
  });

  describe('event detail', () => {
    it('should output CSV detail for a known event', async () => {
      client.setArgv('metrics', 'schema', '--event', 'incomingRequest');

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const stdoutOutput = client.stdout.getFullOutput();
      // Should have two blocks separated by blank line
      expect(stdoutOutput).toContain('dimension,label,filterOnly');
      expect(stdoutOutput).toContain('measure,label,unit');
    });

    it('should output JSON detail with --format=json', async () => {
      client.setArgv(
        'metrics',
        'schema',
        '--event',
        'incomingRequest',
        '--format=json'
      );

      const exitCode = await schema(client, new MockTelemetry());

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.event).toBe('incomingRequest');
      expect(parsed.description).toBeDefined();
      expect(parsed.dimensions).toBeDefined();
      expect(parsed.measures).toBeDefined();
      expect(parsed.aggregations).toBeDefined();
      expect(Array.isArray(parsed.aggregations)).toBe(true);
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
      expect(parsed.error.allowedValues).toContain('incomingRequest');
    });
  });

  describe('telemetry', () => {
    it('should track event option', async () => {
      client.setArgv('metrics', 'schema', '--event', 'incomingRequest');

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:event', value: 'incomingRequest' },
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
