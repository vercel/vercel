import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import metrics from '../../../../src/commands/metrics';

const { mockQuery, mockSchema } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue(0),
  mockSchema: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../../../src/commands/metrics/query', () => ({
  default: mockQuery,
}));

vi.mock('../../../../src/commands/metrics/schema', () => ({
  default: mockSchema,
}));

describe('metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('should print help and return 0', async () => {
      client.setArgv('metrics', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      // Shows schema subcommand
      expect(output).toContain('schema');
      // Shows positional metric examples
      expect(output).toContain('metrics vercel.function_invocation.count');
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

      expect(exitCode).toBe(0);
      expect(mockSchema).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          trackCliSubcommandSchema: expect.any(Function),
        })
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should route to query as default subcommand', async () => {
      client.setArgv('metrics', 'vercel.request.count');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      expect(mockQuery).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          trackCliSubcommandSchema: expect.any(Function),
        })
      );
      expect(mockSchema).not.toHaveBeenCalled();
    });

    it('should track schema subcommand telemetry', async () => {
      client.setArgv('metrics', 'schema');

      await metrics(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:schema', value: 'schema' },
      ]);
    });
  });

  it('shows help when no metric is provided for query', async () => {
    client.setArgv('metrics');

    const exitCode = await metrics(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'metrics vercel.function_invocation.count'
    );
  });
});
