import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import edgeConfig from '../../../../src/commands/edge-config';
import { teamCache } from '../../../../src/util/teams/get-team-by-id';

describe('edge-config', () => {
  beforeEach(() => {
    teamCache.clear();
    client.reset();
    client.config.currentTeam = 'team_ec_test';
    useUser();
    client.scenario.get('/teams/team_ec_test', (_req, res) => {
      res.json({
        id: 'team_ec_test',
        slug: 'ec-team',
        name: 'EC Team',
        billing: { plan: 'pro', period: { start: 0, end: 0 }, addons: [] },
      });
    });
  });

  it('lists edge configs in table output', async () => {
    client.scenario.get('/v1/edge-config', (req, res) => {
      expect(req.query.teamId).toBe('team_ec_test');
      res.json([
        {
          id: 'ecfg_list1',
          slug: 'flags',
          itemCount: 2,
          sizeInBytes: 120,
          updatedAt: 1_700_000_000_000,
        },
      ]);
    });

    client.setArgv('edge-config', 'list');
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('ecfg_list1');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'list',
      },
    ]);
  });

  it('resolves slug when getting a config', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_resolve', slug: 'my-store' }]);
    });
    client.scenario.get('/v1/edge-config/ecfg_resolve', (req, res) => {
      expect(req.query.teamId).toBe('team_ec_test');
      res.json({
        id: 'ecfg_resolve',
        slug: 'my-store',
        itemCount: 0,
        digest: 'd',
      });
    });

    client.setArgv('edge-config', 'get', 'my-store', '--format', 'json');
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out.id).toBe('ecfg_resolve');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:get',
        value: 'get',
      },
      {
        key: 'argument:id-or-slug',
        value: 'my-store',
      },
      {
        key: 'option:format',
        value: 'json',
      },
    ]);
  });

  it('creates a token with --add', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_tok', slug: 's' }]);
    });
    client.scenario.post('/v1/edge-config/ecfg_tok/token', (req, res) => {
      expect(req.body).toEqual({ label: 'ci' });
      res.status(201).json({ token: 'tok_secret', id: 'tokid_1' });
    });

    client.setArgv('edge-config', 'tokens', 'ecfg_tok', '--add', 'ci');
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('tok_secret');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:tokens',
        value: 'tokens',
      },
      {
        key: 'argument:id-or-slug',
        value: 'ecfg_tok',
      },
      {
        key: 'option:add',
        value: '[REDACTED]',
      },
    ]);
  });

  it('validates --patch before slug rename when both --slug and --patch are provided', async () => {
    let putCalled = false;
    client.scenario.put('/v1/edge-config/ecfg_update_order', (_req, res) => {
      putCalled = true;
      res.json({ id: 'ecfg_update_order', slug: 'new-slug' });
    });

    client.setArgv(
      'edge-config',
      'update',
      'ecfg_update_order',
      '--slug',
      'new-slug',
      '--patch',
      '{}'
    );
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(1);
    expect(putCalled).toBe(false);
    await expect(client.stderr).toOutput('`--patch` must be');
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('outputs JSON error when get cannot resolve slug', async () => {
      client.scenario.get('/v1/edge-config', (_req, res) => {
        res.json([]);
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('edge-config', 'get', 'unknown-slug', '--non-interactive');

      await expect(edgeConfig(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'not_found',
      });
    });
  });
});
