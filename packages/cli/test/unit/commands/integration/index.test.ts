import { beforeEach, describe, expect, it, vi } from 'vitest';
import integration from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/get-scope');
const mockedGetScope = vi.mocked(getScopeModule.default);

describe('integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' } as any,
      user: { id: 'user_dummy' } as any,
    });
  });
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'integration';

      client.setArgv(command, '--help');
      const exitCodePromise = integration(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('integration');
    const exitCodePromise = integration(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('integration', ...args);
      const exitCode = await integration(client);
      expect(exitCode).toEqual(2);
    });
  });

  it('lists marketplace installations for the current team', async () => {
    client.scenario.get('/v2/integrations/configurations', (req, res) => {
      expect(req.query.view).toBe('account');
      expect(req.query.installationType).toBe('marketplace');
      res.json([
        {
          id: 'icfg_1',
          integration: { slug: 'neon' },
          ownerId: 'user_x',
        },
      ]);
    });

    client.setArgv('integration', 'installations');

    const exitCode = await integration(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('icfg_1');
    expect(client.stderr.getFullOutput()).toContain('neon');
  });
});
