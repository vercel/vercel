import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import metrics from '../../../../src/commands/metrics';

describe('metrics schema', () => {
  beforeEach(() => {
    client.reset();
  });

  describe('list all events', () => {
    it('should list all available events', async () => {
      client.setArgv('metrics', 'schema');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      // Check the full stderr output
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Available Events');
      expect(output).toContain('incomingRequest');
      expect(output).toContain('functionExecution');
    });

    it('should output JSON when --json flag is used', async () => {
      client.setArgv('metrics', 'schema', '--json');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      // stdout should contain JSON
      const output = client.stdout.getFullOutput();
      expect(output).toContain('"events"');
      expect(output).toContain('"incomingRequest"');
    });
  });

  describe('show event details', () => {
    it('should show dimensions and measures for a specific event', async () => {
      client.setArgv('metrics', 'schema', '-e', 'incomingRequest');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Event: incomingRequest');
      expect(output).toContain('Dimensions (--by)');
      expect(output).toContain('httpStatus');
      expect(output).toContain('Measures (--measure)');
      expect(output).toContain('count');
      expect(output).toContain('requestDurationMs');
    });

    it('should output JSON for a specific event', async () => {
      client.setArgv('metrics', 'schema', '-e', 'incomingRequest', '--json');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed.event).toBe('incomingRequest');
      expect(parsed.dimensions).toBeDefined();
      expect(parsed.measures).toBeDefined();
    });

    it('should error on unknown event', async () => {
      client.setArgv('metrics', 'schema', '-e', 'unknownEvent');

      const exitCodePromise = metrics(client);

      await expect(client.stderr).toOutput(
        'Error: Unknown event "unknownEvent"'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should suggest similar events for typos', async () => {
      client.setArgv('metrics', 'schema', '-e', 'incomingReques');

      const exitCodePromise = metrics(client);

      await expect(client.stderr).toOutput('Did you mean: incomingRequest');
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('help', () => {
    it('should show help with --help flag', async () => {
      client.setArgv('metrics', 'schema', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(2);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        'List available events, dimensions, and measures'
      );
    });
  });
});
