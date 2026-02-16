import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import metrics from '../../../../src/commands/metrics';

describe('metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('should print help and return 2', async () => {
      client.setArgv('metrics', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(2);
      const output = client.stderr.getFullOutput();
      // Shows subcommands
      expect(output).toContain('query');
      expect(output).toContain('schema');
      // Shows default subcommand options
      expect(output).toContain('--event');
    });

    it('should track telemetry for help', async () => {
      client.setArgv('metrics', '--help');

      await metrics(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'metrics' },
      ]);
    });
  });

  describe('subcommand routing', () => {
    it('should route to schema subcommand', async () => {
      client.setArgv('metrics', 'schema');

      const exitCode = await metrics(client);

      // schema lists events, exit 0
      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('event,description');
    });

    it('should route to query as default subcommand', async () => {
      // Without explicit "query", should route to query.
      // Will fail validation since no --event, but that proves routing works.
      client.setArgv('metrics', '--event', 'bogus_event_for_test');

      const exitCode = await metrics(client);

      // Unknown event → error
      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown event');
    });

    it('should route to query with explicit subcommand', async () => {
      client.setArgv('metrics', 'query', '--event', 'bogus_event_for_test');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown event');
    });

    it('should track schema subcommand telemetry', async () => {
      client.setArgv('metrics', 'schema');

      await metrics(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:schema', value: 'schema' },
      ]);
    });
  });
});
