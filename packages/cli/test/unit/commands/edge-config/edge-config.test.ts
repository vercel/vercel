import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import edgeConfig from '../../../../src/commands/edge-config';
import { parseItemValueForSet } from '../../../../src/commands/edge-config/set';
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

  it('lists linked Edge Config refs via GET /v1/storage/stores', async () => {
    useProject(
      {
        ...defaultProject,
        id: 'pr_edge_cfg_linked',
        name: 'edge-linked',
      },
      []
    );
    client.cwd = setupUnitFixture('commands/edge-config/linked');

    client.scenario.get('/v1/storage/stores', (req, res) => {
      expect(req.query.teamId).toBe('team_ec_test');
      res.json({
        stores: [
          {
            type: 'edge-config',
            id: 'ecfg_linked1',
            slug: 'store-a',
            name: 'store-a',
            projectsMetadata: [
              {
                projectId: 'pr_edge_cfg_linked',
                environmentVariables: ['EDGE_CONFIG'],
                environments: ['production'],
              },
            ],
          },
        ],
      });
    });
    client.scenario.get(
      '/projects/pr_edge_cfg_linked/custom-environments',
      (_req, res) => {
        res.json({ environments: [] });
      }
    );

    client.setArgv('edge-config', 'list', '--linked');
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    const err = client.stderr.getFullOutput();
    expect(err).toContain('ecfg_linked1');
    expect(err).toContain('store-a');
    expect(err).toContain('EDGE_CONFIG');
    expect(client.telemetryEventStore.readonlyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'flag:linked', value: 'TRUE' }),
      ])
    );
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

  it('sets a single item via PUT /v1/edge-config/:id/item/:key', async () => {
    client.scenario.get('/v1/edge-config', (_req, res) => {
      res.json([{ id: 'ecfg_set1', slug: 'store-set' }]);
    });
    client.scenario.put('/v1/edge-config/ecfg_set1/item/flag_a', (req, res) => {
      expect(req.body).toEqual({ value: true });
      res.json({ status: 'ok' });
    });

    client.setArgv(
      'edge-config',
      'set',
      'store-set',
      'flag_a',
      '--value',
      'true'
    );
    const exitCode = await edgeConfig(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('item set');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:set',
        value: 'set',
      },
      {
        key: 'argument:id-or-slug',
        value: 'store-set',
      },
      {
        key: 'argument:key',
        value: 'flag_a',
      },
      {
        key: 'option:value',
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

  describe('parseItemValueForSet', () => {
    it('parses JSON primitives and structured values', () => {
      expect(parseItemValueForSet('true')).toBe(true);
      expect(parseItemValueForSet('false')).toBe(false);
      expect(parseItemValueForSet('null')).toBe(null);
      expect(parseItemValueForSet('42')).toBe(42);
      expect(parseItemValueForSet('["a"]')).toEqual(['a']);
      expect(parseItemValueForSet('{"x":1}')).toEqual({ x: 1 });
    });

    it('returns raw string when JSON.parse fails', () => {
      expect(parseItemValueForSet('hello')).toBe('hello');
      expect(parseItemValueForSet('not json {')).toBe('not json {');
    });

    it('trims before JSON parse', () => {
      expect(parseItemValueForSet('  true  ')).toBe(true);
    });

    it('returns empty string for whitespace-only input', () => {
      expect(parseItemValueForSet('   ')).toBe('');
    });
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
