import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import metrics from '../../../../src/commands/metrics';
import getScope from '../../../../src/util/get-scope';
import { getLinkedProject } from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/link');

const mockedGetScope = vi.mocked(getScope);
const mockedGetLinkedProject = vi.mocked(getLinkedProject);

function mockSchemaApi() {
  client.scenario.get('/v1/observability/schema', (_req, res) => {
    res.json({
      events: [{ name: 'incomingRequest', description: 'Edge Requests' }],
    });
  });

  client.scenario.get(
    '/v1/observability/schema/incomingRequest',
    (_req, res) => {
      res.json({
        name: 'incomingRequest',
        description: 'Edge Requests',
        dimensions: [],
        measures: [
          {
            name: 'count',
            label: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ],
      });
    }
  );
}

describe('metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' } as any,
      user: { id: 'user_dummy' } as any,
    });
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
    } as any);
    mockSchemaApi();
  });

  describe('--help', () => {
    it('should print help and return 0', async () => {
      client.setArgv('metrics', '--help');

      const exitCode = await metrics(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      // Shows schema subcommand
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
      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).toContain('Event found');
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

    it('should track schema subcommand telemetry', async () => {
      client.setArgv('metrics', 'schema');

      await metrics(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:schema', value: 'schema' },
      ]);
    });
  });
});
