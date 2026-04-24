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

  it('revokes by id when --remove values match known token ids', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_rm_id', slug: 's' }]);
    });
    let listCount = 0;
    client.scenario.get('/v1/edge-config/ecfg_rm_id/tokens', (_req, res) => {
      listCount += 1;
      res.json([
        { id: 'tokid_a', label: 'prod', partialToken: 'aaaa********' },
        { id: 'tokid_b', label: 'dev', partialToken: 'bbbb********' },
      ]);
    });
    let deleteBody: unknown;
    client.scenario.delete('/v1/edge-config/ecfg_rm_id/tokens', (req, res) => {
      deleteBody = req.body;
      res.status(204).end();
    });

    client.setArgv(
      'edge-config',
      'tokens',
      'ecfg_rm_id',
      '--remove',
      'tokid_a',
      '--remove',
      'tokid_b',
      '--yes',
      '--format',
      'json'
    );
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    expect(listCount).toBe(1);
    expect(deleteBody).toEqual({ ids: ['tokid_a', 'tokid_b'] });
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toEqual({ status: 'ok', revoked: 2 });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:tokens', value: 'tokens' },
      { key: 'argument:id-or-slug', value: 'ecfg_rm_id' },
      { key: 'option:remove', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
      { key: 'option:format', value: 'json' },
    ]);
  });

  it('revokes by token string when --remove values do not match known ids', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_rm_tok', slug: 's' }]);
    });
    client.scenario.get('/v1/edge-config/ecfg_rm_tok/tokens', (_req, res) => {
      res.json([
        { id: 'tokid_x', label: 'prod', partialToken: 'xxxx********' },
      ]);
    });
    let deleteBody: unknown;
    client.scenario.delete('/v1/edge-config/ecfg_rm_tok/tokens', (req, res) => {
      deleteBody = req.body;
      res.status(204).end();
    });

    client.setArgv(
      'edge-config',
      'tokens',
      'ecfg_rm_tok',
      '--remove',
      'plaintext_a',
      '--remove',
      'plaintext_b',
      '--yes',
      '--format',
      'json'
    );
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    expect(deleteBody).toEqual({
      tokens: ['plaintext_a', 'plaintext_b'],
    });
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toEqual({ status: 'ok', revoked: 2 });
  });

  it('splits a mixed --remove list into ids and tokens', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_rm_mix', slug: 's' }]);
    });
    client.scenario.get('/v1/edge-config/ecfg_rm_mix/tokens', (_req, res) => {
      res.json([
        { id: 'tokid_known', label: 'prod', partialToken: 'kkkk********' },
      ]);
    });
    let deleteBody: unknown;
    client.scenario.delete('/v1/edge-config/ecfg_rm_mix/tokens', (req, res) => {
      deleteBody = req.body;
      res.status(204).end();
    });

    client.setArgv(
      'edge-config',
      'tokens',
      'ecfg_rm_mix',
      '--remove',
      'tokid_known',
      '--remove',
      'plaintext_legacy',
      '--yes',
      '--format',
      'json'
    );
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    expect(deleteBody).toEqual({
      tokens: ['plaintext_legacy'],
      ids: ['tokid_known'],
    });
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toEqual({ status: 'ok', revoked: 2 });
  });

  it('lists tokens with partialToken (masked value) in table output', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_tok', slug: 'my-store' }]);
    });
    client.scenario.get('/v1/edge-config/ecfg_tok/tokens', (_req, res) => {
      res.json([
        {
          id: 'tok_abc123',
          label: 'production',
          partialToken: 'ecr********',
          createdAt: 1_713_528_000_000,
        },
      ]);
    });

    client.setArgv('edge-config', 'tokens', 'my-store');
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('tok_abc123');
    await expect(client.stderr).toOutput('ecr********');
    await expect(client.stderr).toOutput('production');
  });

  it('lists tokens with partialToken in JSON output', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_tok', slug: 'my-store' }]);
    });
    client.scenario.get('/v1/edge-config/ecfg_tok/tokens', (_req, res) => {
      res.json([
        {
          id: 'tok_abc123',
          label: 'production',
          partialToken: 'ecr********',
          createdAt: 1_713_528_000_000,
        },
      ]);
    });

    client.setArgv('edge-config', 'tokens', 'my-store', '--format', 'json');
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toEqual([
      {
        id: 'tok_abc123',
        label: 'production',
        partialToken: 'ecr********',
        createdAt: 1_713_528_000_000,
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
