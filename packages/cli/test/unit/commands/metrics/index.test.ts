import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('should show KQL support by default', async () => {
      vi.stubEnv('FF_LEGACY_METRICS', '');
      client.setArgv('metrics', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      // Shows schema subcommand
      expect(output).toContain('schema');
      // Shows positional metric examples
      expect(output).toContain('metrics vercel.function_invocation.count');
      // Shows production convenience flag
      expect(output).toContain('--prod');
      expect(output).toContain('KQL filter expression');
      expect(output).toContain('-f "httpStatus >= 500" --group-by errorCode');
      expect(output).toContain('Order grouped results by value or count');
      expect(output).toContain('count, or value when count is unsupported');
      expect(output).toContain(
        'vercel metrics vercel.ai_gateway.request.cost -a sum --group-by aiProvider --since 7d'
      );
      expect(output).toContain(
        'vercel metrics vercel.analytics.page_view.count --since 7d --granularity 1d'
      );
      expect(output).toContain(
        'vercel metrics vercel.analytics.page_view.count -a unique/visitorId --group-by country --since 1d --granularity 1h --limit 5'
      );
      expect(output).not.toContain('vercel.ai_gateway_request.cost');
      expect(output).not.toContain('vercel.analytics_pageview.count');
      expect(output).not.toContain('2026-05-28');
    });

    it('should show OData support when FF_LEGACY_METRICS is enabled', async () => {
      vi.stubEnv('FF_LEGACY_METRICS', '1');
      client.setArgv('metrics', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('OData filter expression');
      expect(output).toContain('-f "http_status ge 500" --group-by error_code');
      expect(output).toContain(
        'vercel metrics vercel.ai_gateway_request.cost -a sum --group-by ai_provider --since 7d'
      );
      expect(output).toContain(
        'vercel metrics vercel.analytics_pageview.count --since 7d --granularity 1d --bucket-timezone Europe/Paris'
      );
      expect(output).toContain('--bucket-timezone Europe/Paris');
      expect(output).not.toContain('vercel.ai_gateway.request.cost');
      expect(output).not.toContain('vercel.analytics.page_view.count');
      expect(output).not.toContain('2026-05-28');
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
