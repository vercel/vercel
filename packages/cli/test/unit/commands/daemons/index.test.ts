import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import daemons from '../../../../src/commands/daemons';
import { client } from '../../../mocks/client';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import type { Daemon } from '../../../../src/commands/daemons/api';
import chalk from 'chalk';
import chars from '../../../../src/util/output/chars';

const instanceId = 'dmni_01k7d0q5w3x8y9z0a1b2c3d4e5';
const otherInstanceId = 'dmni_01k7d0q5w3x8y9z0a1b2c3d4e6';
const base = '/v1/projects/prj_d/daemons';

function daemon(
  name: string,
  ids: string[] = [],
  config?: Daemon['config']
): Daemon {
  const items = ids.map(id => ({
    id,
    region: 'iad1',
    startedAt: '2026-10-02T00:00:00.000Z',
    alive: true,
  }));
  return {
    name,
    status: 'ready',
    updatedAt: '2026-10-02T00:00:00.000Z',
    config,
    instances: { desired: ids.length, ready: ids.length, items },
  };
}

/** Serves pages of daemons in order, following the `cursor` query. */
function mockDaemons(...pages: ReturnType<typeof daemon>[][]) {
  const queries: Record<string, unknown>[] = [];
  client.scenario.get(base, (req, res) => {
    queries.push(req.query);
    const index = Number(req.query.cursor ?? 0);
    const next = index + 1 < pages.length ? String(index + 1) : undefined;
    res.json({ daemons: pages[index], pagination: { next } });
  });
  return queries;
}

/** Records requests to `path` and answers them with `status`. */
function mockWrite(method: 'put' | 'post', path: string, status = 200) {
  const requests: { params: unknown; query: unknown; body: unknown }[] = [];
  client.scenario[method](`${base}${path}`, (req, res) => {
    requests.push({ params: req.params, query: req.query, body: req.body });
    res.status(status).json(status < 300 ? { ok: true } : {});
  });
  return requests;
}

function run(...args: string[]) {
  client.setArgv('daemons', ...args, '--project', 'd');
  return daemons(client);
}

const stdout = () => client.stdout.getFullOutput();
const stderr = () => client.stderr.getFullOutput();

function jsonError() {
  expect(stdout()).toBe('');
  expect(stderr().trim().split('\n')).toHaveLength(1);
  expect(stderr()).not.toContain('\u001b');
  return JSON.parse(stderr());
}

describe('daemons', () => {
  beforeEach(() => {
    client.reset();
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'prj_d',
      name: 'd',
      accountId: 'team_dummy',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    chalk.level = 0;
  });

  it('rejects an unknown subcommand', async () => {
    expect(await run('instances', 'nope')).toBe(2);
    expect(stderr()).toContain('Unknown command nope');
  });

  it.each([
    ['inspect', false],
    ['restart', true],
  ] as const)('helps find a missing ID for %s (JSON=%s)', async (action, asJson) => {
    const fetch = vi.spyOn(client, 'fetch');

    expect(await run('instances', action, ...(asJson ? ['--json'] : []))).toBe(
      2
    );
    expect(fetch).not.toHaveBeenCalled();
    if (asJson) {
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        message: 'An instance ID is required.',
        next: [{ command: 'vercel daemons instances list --project d' }],
      });
    } else {
      expect(stdout()).toBe('');
      expect(stderr()).toContain('An instance ID is required.');
      expect(stderr()).toContain('List available instances:');
      expect(stderr()).toContain('vercel daemons instances list --project d');
    }
  });

  describe('flag placement', () => {
    it.each([
      ['--project=d', '--json', 'list'],
      ['--json', '--project', 'd'],
    ])('lists daemons with %j', async (...args) => {
      mockDaemons([daemon('worker', [instanceId])]);
      client.setArgv('daemons', ...args);

      expect(await daemons(client)).toBe(0);
      expect(JSON.parse(stdout()).daemons).toHaveLength(1);
      expect(stderr()).toBe('');
    });

    it('accepts singular group aliases with flags before the actions', async () => {
      mockDaemons([daemon('worker', [instanceId])]);
      client.setArgv('daemon', '--json', 'instance', '--project', 'd', 'ls');

      expect(await daemons(client)).toBe(0);
      expect(JSON.parse(stdout()).instances[0].id).toBe(instanceId);
    });

    it('retains inspection time flags before the instance group', async () => {
      mockDaemons([daemon('worker', [instanceId])]);
      let timeRange: { start: string; end: string } | undefined;
      client.scenario.post('/metrics/v1', (req, res) => {
        timeRange = req.body.timeRange;
        res.json({ summary: [], series: [], meta: {} });
      });
      client.setArgv(
        'daemons',
        '--since',
        '1d',
        'instances',
        '--project',
        'd',
        'inspect',
        instanceId,
        '--json'
      );

      expect(await daemons(client)).toBe(0);
      expect(JSON.parse(stdout()).instance.id).toBe(instanceId);
      expect(
        timeRange && Date.parse(timeRange.end) - Date.parse(timeRange.start)
      ).toBe(86_400_000);
    });

    it.each([
      ['--nonesuch', 'list'],
      ['--reset', 'list'],
      ['--limit', '1', 'instances', 'list'],
      ['instances', '--since', '1h', 'list'],
      ['scale', 'worker', '--', '--reset'],
    ])('rejects invalid options before any request for %j', async (...args) => {
      const fetch = vi.spyOn(client, 'fetch');

      expect(await run(...args, '--json')).toBe(2);
      expect(jsonError()).toMatchObject({ reason: 'invalid_arguments' });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('JSON output', () => {
    it('keeps JSON uncolored when color is enabled', async () => {
      chalk.level = 1;
      mockDaemons([daemon('worker', [instanceId])]);

      expect(await run('list', '--json')).toBe(0);
      expect(JSON.parse(stdout()).daemons).toHaveLength(1);
      expect(stdout()).not.toContain('\u001b');
      // On Windows chars.dot is `o`, so match the formatted `<dot> <Label>`.
      expect(stdout()).not.toContain(`${chars.dot} `);
      expect(stderr()).toBe('');
    });

    it('writes a missing-resource error only to stderr', async () => {
      mockDaemons([daemon('worker')]);

      expect(await run('instances', 'list', 'missing', '--json')).toBe(1);
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'not_found',
        next: [{ command: 'vercel daemons list --project d' }],
      });
    });

    it.each([
      [2, 'unknown_command', ['instances', 'nope']],
      [2, 'invalid_arguments', ['list', '--limit', '0']],
    ])('returns %s and a %s JSON error for %j', async (code, reason, args) => {
      expect(await run(...args, '--json')).toBe(code);
      expect(jsonError()).toMatchObject({ status: 'error', reason });
    });

    it('reports project-resolution errors without exiting the process', async () => {
      useUnknownProject();
      client.setArgv('daemons', 'list', '--project', 'missing', '--json');

      expect(await daemons(client)).toBe(1);
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'project_not_found',
      });
    });

    it('reports a missing project link as JSON', async () => {
      client.setArgv('daemons', 'list', '--json');

      expect(await daemons(client)).toBe(1);
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'not_linked',
      });
    });

    it('reports API errors without putting remote text in the headline', async () => {
      client.scenario.get(base, (_req, res) => {
        res.status(403).json({
          error: { code: 'forbidden', message: 'untrusted remote message' },
        });
      });

      expect(await run('list', '--json')).toBe(1);
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'api_error',
        data: { httpStatus: 403 },
      });
      expect(stderr()).not.toContain('untrusted remote message');
    });

    it('keeps the --format json compatibility path quiet', async () => {
      mockDaemons([]);

      expect(await run('list', '--format', 'json')).toBe(0);
      expect(JSON.parse(stdout())).toEqual({
        daemons: [],
        pagination: { next: null },
      });
      expect(stderr()).toBe('');
    });
  });

  describe('list', () => {
    it.each([
      ['ready', 'green', 'Ready'],
      ['reconciling', 'yellow', 'Reconciling'],
      ['stopped', 'gray', 'Stopped'],
      ['paused', 'gray', 'Paused'],
    ] as const)('shows a colored dot for %s daemons', async (status, color, label) => {
      chalk.level = 1;
      const worker = daemon('worker', [instanceId]);
      worker.status = status;
      mockDaemons([worker]);

      expect(await run('list')).toBe(0);
      expect(stdout()).toContain(`${chalk[color](chars.dot)} ${label}`);
    });

    it.each([
      false,
      true,
    ])('fetches every daemon page by default (JSON=%s)', async asJson => {
      const queries = mockDaemons(
        Array.from({ length: 100 }, (_, i) => daemon(`worker-${i}`)),
        [daemon('cron', [otherInstanceId])],
        []
      );

      expect(await run('list', ...(asJson ? ['--json'] : []))).toBe(0);
      expect(queries).toHaveLength(3);
      expect(queries.map(query => query.cursor)).toEqual([undefined, '1', '2']);
      expect(queries.every(query => query.limit === '100')).toBe(true);
      if (asJson) {
        const result = JSON.parse(stdout());
        expect(result.daemons).toHaveLength(101);
        expect(result.daemons[0].name).toBe('worker-0');
        expect(result.daemons[100].name).toBe('cron');
        expect(result.pagination).toEqual({ next: null });
        expect(stderr()).toBe('');
      } else {
        expect(stdout()).toContain('worker-99');
        expect(stdout()).toContain('cron');
        expect(stderr()).not.toContain('Next page');
      }
    });

    it('fails without printing a partial daemon list when a later page fails', async () => {
      client.scenario.get(base, (req, res) => {
        if (req.query.cursor) {
          res.status(403).json({ error: { code: 'forbidden' } });
        } else {
          res.json({ daemons: [daemon('worker')], pagination: { next: '1' } });
        }
      });

      expect(await run('list', '--json')).toBe(1);
      expect(jsonError()).toMatchObject({
        status: 'error',
        reason: 'api_error',
      });
    });

    it('sorts regional counts, collapses extra regions, and marks overrides in a compact table', async () => {
      const worker = daemon('docker-cmd', [instanceId], {
        instances: {
          yul1: 1,
          sfo1: 1,
          hkg1: 1,
          fra1: 1,
          dub1: 1,
          cpt1: 1,
          bom1: 1,
          arn1: 1,
          iad1: 2,
          icn1: 0,
        },
        configuredInstances: { iad1: 1 },
      });
      worker.instances.desired = worker.instances.ready = 10;
      mockDaemons([worker]);

      expect(await run('list', '--limit', '5', '--next', '0')).toBe(0);
      expect(stdout()).toContain('Instances');
      expect(stdout()).toContain('10/10');
      expect(stdout()).toContain('iad1:2 arn1:1 bom1:1 +6 *');
      expect(stdout()).not.toContain('icn1:0');
      expect(stdout()).not.toContain('yul1:1');
      expect(stderr()).toContain('* Scaling overridden.');
      expect(stderr()).toContain('+N more regions.');
      expect(stderr()).toContain(
        'daemons list --json --limit 5 --next 0 --project d'
      );
      for (const line of stdout().split('\n')) {
        expect(line.length).toBeLessThanOrEqual(80);
      }
    });

    it.each([
      [
        { iad1: 3, arn1: 1, bom1: 1, cpt1: 1, fra1: 0 },
        'iad1:3 arn1:1 bom1:1 cpt1:1',
      ],
      [
        { iad1: 3, arn1: 1, bom1: 1, cpt1: 1, fra1: 1 },
        'iad1:3 arn1:1 bom1:1 +2',
      ],
    ])('collapses only when at least two regions are hidden: %j', async (instances, expected) => {
      mockDaemons([daemon('worker', [], { instances })]);

      expect(await run('list')).toBe(0);
      expect(stdout()).toContain(expected);
      expect(stdout()).not.toContain('+1');
      expect(stdout()).not.toContain('fra1:0');
    });

    it.each([
      [undefined, '1 instance'],
      [{ instances: 2 }, '2 instances'],
      [{ instances: { iad1: 0 } }, '0 instances'],
    ])('falls back to a total when no regional counts are available: %j', async (config, expected) => {
      mockDaemons([daemon('worker', [instanceId], config)]);

      expect(await run('list')).toBe(0);
      expect(stdout()).toContain(expected);
      expect(stderr()).not.toContain('Scaling overridden');
      expect(stderr()).not.toContain('Show all region counts');
    });

    it('marks overrides even when the effective and configured counts are equal', async () => {
      mockDaemons([
        daemon('worker', [instanceId], {
          instances: { iad1: 1 },
          configuredInstances: { iad1: 1 },
        }),
      ]);

      expect(await run('list')).toBe(0);
      expect(stdout()).toContain('iad1:1 *');
      expect(stderr()).toContain('* Scaling overridden.');
    });

    it('keeps the full configuration and all regions in JSON', async () => {
      const config = {
        instances: { iad1: 2, arn1: 1, bom1: 1, cpt1: 1, fra1: 1, icn1: 0 },
        configuredInstances: { iad1: 1 },
      };
      mockDaemons([daemon('worker', [instanceId], config)]);

      expect(await run('list', '--json')).toBe(0);
      expect(JSON.parse(stdout()).daemons[0].config).toEqual(config);
      expect(stderr()).toBe('');
    });

    it('reads `replicas` when the API omits `instances`', async () => {
      const { config, instances, ...rest } = daemon('worker', [instanceId], {
        instances: { iad1: 2 },
        configuredInstances: { iad1: 1 },
      });
      client.scenario.get(base, (_req, res) => {
        res.json({
          daemons: [
            {
              ...rest,
              config: {
                replicas: { iad1: 2 },
                configuredReplicas: { iad1: 1 },
              },
              replicas: instances,
            },
          ],
          pagination: {},
        });
      });

      expect(await run('list', '--json')).toBe(0);
      expect(JSON.parse(stdout()).daemons).toEqual([
        { ...rest, config, instances },
      ]);
    });

    it('prints production daemons and a next page command that keeps the filters', async () => {
      const queries = mockDaemons([daemon('worker', [instanceId])], []);

      expect(await run('--limit', '5')).toBe(0);
      expect(stdout()).toContain('worker');
      expect(stdout()).toContain('1/1');
      expect(stderr()).toContain('daemons list --limit 5 --next 1 --project d');
      expect(queries[0]).toMatchObject({
        scopeValue: 'production',
        limit: '5',
      });
    });

    it.each([
      ['a non-numeric --limit', ['--limit', 'abc']],
      ['a --limit above 100', ['--limit', '101']],
      ['an argument', ['extra']],
    ])('rejects %s before any request', async (_label, args) => {
      const queries = mockDaemons([]);

      expect(await run('list', ...args)).toBe(2);
      expect(queries).toEqual([]);
    });
  });

  describe('inspect', () => {
    const config = {
      instances: { iad1: 2, fra1: 1, sfo1: 0 },
      configuredInstances: { iad1: 1, fra1: 2, sfo1: 1 },
      image: { requested: 'image:latest', resolved: 'image@sha256:current' },
      resources: { requests: { memory: '2048Mi' } },
    };

    it('shows configuration, overrides, identity, and regional readiness', async () => {
      const worker = daemon('worker', [instanceId], config);
      worker.status = 'reconciling';
      worker.deploymentId = 'dpl_test';
      worker.instances.desired = 3;
      worker.instances.ready = 1;
      const instance = worker.instances.items[0];
      worker.instances.items = [
        { ...instance, image: config.image.resolved, memoryMiB: 2048 },
        {
          ...instance,
          id: otherInstanceId,
          image: 'image@sha256:old',
          memoryMiB: 2048,
        },
        {
          ...instance,
          id: 'memory-drift',
          region: 'fra1',
          image: config.image.resolved,
          memoryMiB: 1024,
        },
        {
          ...instance,
          id: 'stopped',
          region: 'sfo1',
          stoppedAt: '2026-10-15T07:00:00Z',
        },
      ];
      mockDaemons([worker]);

      expect(await run('inspect', 'worker')).toBe(0);
      expect(stderr()).toContain('Environment');
      expect(stderr()).toContain('Production');
      expect(stdout()).toContain(`${chars.dot} Reconciling`);
      expect(stdout()).toMatch(/Ready\s+1\/3/);
      expect(stdout()).toMatch(/Overrides\s+Active/);
      expect(stdout()).toContain('dpl_test');
      expect(stdout()).toContain(config.image.resolved);
      expect(stdout()).toMatch(/Memory\/instance\s+2048 MiB/);
      expect(stdout()).toMatch(/fra1\s+2\s+1\s+0\s+1/);
      expect(stdout()).toMatch(/iad1\s+1\s+2\s+1\s+2/);
      expect(stdout()).toMatch(/sfo1\s+1\s+0\s+0\s+0/);
      expect(stderr()).toContain('daemons instances list worker --project d');
    });

    it('returns scoped JSON and matches API readiness independently of liveness', async () => {
      const worker = daemon('worker', [instanceId], {
        ...config,
        instances: { iad1: 2 },
        configuredInstances: { iad1: 1 },
      });
      worker.status = 'reconciling';
      worker.instances.desired = worker.instances.ready = 2;
      const instance = {
        ...worker.instances.items[0],
        image: config.image.resolved,
        memoryMiB: 2048,
      };
      worker.instances.items = [
        { ...instance, alive: false },
        { ...instance, id: 'matching-2' },
        { ...instance, id: 'matching-3' },
        { ...instance, id: 'stopped', stoppedAt: '2026-10-15T07:00:00Z' },
        { ...instance, id: 'memory-drift', memoryMiB: 1024 },
        { ...instance, id: 'image-drift', image: 'image@sha256:old' },
      ];
      mockDaemons([worker]);

      client.setArgv(
        'daemons',
        '--json',
        '--project',
        'd',
        'inspect',
        'worker'
      );
      expect(await daemons(client)).toBe(0);
      const result = JSON.parse(stdout());
      expect(result.daemon).toEqual(worker);
      expect(result.context).toMatchObject({
        project: { id: 'prj_d', name: 'd' },
        team: { id: 'team_dummy' },
        environment: 'production',
      });
      expect(result.scalingOverridden).toBe(true);
      expect(result.regions).toEqual([
        { region: 'iad1', configured: 1, desired: 2, ready: 2, alive: 4 },
      ]);
      expect(result.next[0].command).toContain('daemons instances list worker');
      expect(stderr()).toBe('');
    });

    it('finds an exact daemon name across pages', async () => {
      const queries = mockDaemons([daemon('worker-long')], [daemon('worker')]);

      expect(await run('inspect', 'worker', '--json')).toBe(0);
      expect(JSON.parse(stdout()).daemon.name).toBe('worker');
      expect(queries).toHaveLength(2);
    });

    it('inspects a daemon with no active instances and legacy scalar counts', async () => {
      mockDaemons([daemon('worker', [], { instances: 0 })]);

      expect(await run('inspect', 'worker', '--json')).toBe(0);
      const result = JSON.parse(stdout());
      expect(result.scalingOverridden).toBe(false);
      expect(result.regions).toEqual([
        { region: 'iad1', configured: 0, desired: 0, ready: 0, alive: 0 },
      ]);
    });

    it('keeps unknown regional counts null rather than guessing', async () => {
      mockDaemons([daemon('worker', [instanceId])]);

      expect(await run('inspect', 'worker', '--json')).toBe(0);
      expect(JSON.parse(stdout()).regions).toEqual([
        {
          region: 'iad1',
          configured: null,
          desired: null,
          ready: null,
          alive: 1,
        },
      ]);
    });

    it('reports an unknown daemon', async () => {
      mockDaemons([daemon('worker')]);

      expect(await run('inspect', 'missing')).toBe(1);
      expect(stderr()).toContain("Couldn't find production daemon missing");
    });

    it.each([
      [],
      ['invalid/name'],
      ['worker', 'extra'],
    ])('rejects invalid daemon selectors before requests: %j', async (...args) => {
      const fetch = vi.spyOn(client, 'fetch');

      expect(await run('inspect', ...args, '--json')).toBe(2);
      expect(jsonError()).toMatchObject({ reason: 'invalid_arguments' });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('instances list', () => {
    it.each([
      { state: { alive: true }, color: 'green', label: 'Alive' },
      { state: { alive: false }, color: 'red', label: 'Not alive' },
      {
        state: { alive: true, stoppedAt: '2026-10-15T07:00:00Z' },
        color: 'gray',
        label: 'Stopped',
      },
    ] as const)('shows a colored dot for $label instances', async ({
      state,
      color,
      label,
    }) => {
      chalk.level = 1;
      const worker = daemon('worker', [instanceId]);
      Object.assign(worker.instances.items[0], state);
      mockDaemons([worker]);

      expect(await run('instances', 'list')).toBe(0);
      expect(stdout()).toContain('Instance');
      expect(stdout()).toContain('Status');
      expect(stdout()).not.toContain('State');
      expect(stdout()).toContain(`${chalk[color](chars.dot)} ${label}`);
    });

    it('lists the instances of every daemon across pages', async () => {
      const queries = mockDaemons(
        [daemon('worker', [instanceId])],
        [daemon('cron', [otherInstanceId])]
      );

      expect(await run('instances', 'list')).toBe(0);
      expect(stdout()).toContain(instanceId);
      expect(stdout()).toContain(otherInstanceId);
      expect(queries).toHaveLength(2);
    });

    it('lists the instances of one daemon as JSON', async () => {
      mockDaemons([
        daemon('worker', [instanceId]),
        daemon('cron', [otherInstanceId]),
      ]);

      expect(await run('instances', 'list', 'worker', '--json')).toBe(0);
      expect(JSON.parse(stdout()).instances).toMatchObject([
        { id: instanceId, daemon: 'worker' },
      ]);
      expect(stderr()).toBe('');
    });
  });

  describe('scale', () => {
    it('sets instance overrides by region', async () => {
      const requests = mockWrite('put', '/worker/instances');

      expect(await run('scale', 'worker', 'iad1=3', 'fra1=0')).toBe(0);
      expect(requests).toMatchObject([
        { query: { target: 'production' }, body: { iad1: 3, fra1: 0 } },
      ]);
      expect(stderr()).toContain('iad1=3, fra1=0');
    });

    it('removes the overrides with --reset and prints the outcome as JSON', async () => {
      const requests = mockWrite('put', '/worker/instances');

      expect(await run('scale', 'worker', '--reset', '--json')).toBe(0);
      expect(requests).toMatchObject([{ body: {} }]);
      const result = JSON.parse(stdout());
      expect(result).toMatchObject({
        daemon: { name: 'worker' },
        outcome: 'scaled',
      });
      expect(result.next[0].command).toContain('daemons instances list worker');
      expect(stderr()).toBe('');
    });

    it('reports a daemon that does not exist', async () => {
      mockWrite('put', '/worker/instances', 404);

      expect(await run('scale', 'worker', 'iad1=2')).toBe(1);
      expect(stderr()).toContain("Couldn't find production daemon worker");
    });

    it.each([
      ['no overrides and no --reset', ['worker']],
      ['overrides together with --reset', ['worker', 'iad1=1', '--reset']],
      ['an override without a count', ['worker', 'iad1']],
      ['more than 100 instances in a region', ['worker', 'iad1=101']],
      ['the same region twice', ['worker', 'iad1=1', 'iad1=2']],
    ])('rejects %s before any request', async (_label, args) => {
      const requests = mockWrite('put', '/worker/instances');

      expect(await run('scale', ...args)).toBe(2);
      expect(requests).toEqual([]);
    });
  });

  describe('instances inspect', () => {
    it.each([
      ['reversed relative times', '1h', '1d'],
      [
        'reversed absolute times',
        '2026-10-15T07:00:00Z',
        '2026-10-15T06:00:00Z',
      ],
      ['equal times', '2026-10-15T07:00:00Z', '2026-10-15T07:00:00Z'],
      [
        'times in the same second',
        '2026-10-15T07:00:00.100Z',
        '2026-10-15T07:00:00.900Z',
      ],
    ])('rejects %s before any request', async (_label, since, until) => {
      const fetch = vi.spyOn(client, 'fetch');
      const flags = ['--since', since, '--until', until, '--json'];

      expect(await run('instances', 'inspect', instanceId, ...flags)).toBe(2);
      expect(fetch).not.toHaveBeenCalled();
      expect(jsonError()).toMatchObject({ reason: 'invalid_arguments' });
    });

    function mockMetrics(status = 200) {
      const bodies: Record<string, unknown>[] = [];
      client.scenario.post('/metrics/v1', (req, res) => {
        bodies.push(req.body);
        const { start, end } = req.body.timeRange;
        if ([start, end].some(value => Date.parse(value) % 1000 !== 0)) {
          res.status(400).json({
            error: {
              code: 'invalid_request',
              message: 'Metrics require whole-second time ranges.',
            },
          });
          return;
        }
        const values = { cpu: 25, cpuTime: 30_000, memory: 512 * 1024 ** 2 };
        const series = [
          { timestamp: '2026-10-14T20:00:00Z', dimensions: {}, values },
        ];
        res
          .status(status)
          .json({ series, summary: [{ dimensions: {}, values }], meta: {} });
      });
      return bodies;
    }

    it('prints the instance details and its usage', async () => {
      mockDaemons([daemon('worker', [instanceId])]);
      const bodies = mockMetrics();

      expect(
        await run('instances', 'inspect', instanceId, '--since', '1h')
      ).toBe(0);
      expect(stdout()).toContain('worker');
      expect(stdout()).toMatch(new RegExp(`Status\\s+${chars.dot} Alive`));
      expect(stdout()).toContain('25%');
      expect(bodies[0]).toMatchObject({
        scope: { projectIds: ['prj_d'] },
        filter: `instanceId:${instanceId}`,
        bucketSeconds: 300,
        formulas: { cpu: 'cpuTime / provisionedCpu * 100' },
      });
    });

    it.each([
      ['the default window', [], '2026-10-14T19:00:00.000Z'],
      ['a relative window', ['--since', '1d'], '2026-10-13T20:00:00.000Z'],
      [
        'explicit fractional-second timestamps',
        [
          '--since',
          '2026-10-14T19:00:00.987Z',
          '--until',
          '2026-10-14T20:00:00.123Z',
        ],
        '2026-10-14T19:00:00.000Z',
      ],
    ])('loads metrics for %s with whole-second bounds', async (_label, args, start) => {
      vi.spyOn(Date, 'now').mockReturnValue(
        Date.parse('2026-10-14T20:00:00.456Z')
      );
      mockDaemons([daemon('worker', [instanceId])]);
      const bodies = mockMetrics();

      expect(await run('instances', 'inspect', instanceId, ...args)).toBe(0);
      expect(stdout()).toContain('25%');
      expect(stderr()).not.toContain("Couldn't load the usage metrics");
      expect(bodies[0]).toMatchObject({
        timeRange: { start, end: '2026-10-14T20:00:00.000Z' },
      });
    });

    it('still prints the details when the usage is unavailable', async () => {
      mockDaemons([daemon('worker', [instanceId])]);
      mockMetrics(403);

      expect(await run('instances', 'inspect', instanceId, '--json')).toBe(0);
      const result = JSON.parse(stdout());
      expect(result).toMatchObject({
        instance: { id: instanceId },
        metrics: null,
      });
      expect(result.warnings[0].reason).toBe('metrics_unavailable');
      expect(stderr()).toBe('');
    });

    it('fails for an instance that is not running', async () => {
      mockDaemons([daemon('worker')]);

      expect(await run('instances', 'inspect', instanceId)).toBe(1);
      expect(stderr()).toContain("Couldn't find running production instance");
    });
  });

  describe('instances restart', () => {
    const restart = `/:daemon/instances/:instance/restart`;

    it('finds the daemon of the instance and restarts it', async () => {
      mockDaemons([daemon('cron')], [daemon('worker', [instanceId])]);
      const requests = mockWrite('post', restart, 202);

      expect(await run('instances', 'restart', instanceId, '--json')).toBe(0);
      expect(requests).toMatchObject([
        { params: { daemon: 'worker', instance: instanceId } },
      ]);
      const result = JSON.parse(stdout());
      expect(result).toMatchObject({ outcome: 'accepted' });
      expect(result.next[0].command).toContain(
        `instances inspect ${instanceId}`
      );
      expect(stderr()).toBe('');
    });

    it('sends the restart only once when the controller fails', async () => {
      mockDaemons([daemon('worker', [instanceId])]);
      const requests = mockWrite('post', restart, 500);

      expect(await run('instances', 'restart', instanceId)).toBe(1);
      expect(requests).toHaveLength(1);
    });

    it('reports an instance that is still starting', async () => {
      mockDaemons([daemon('worker', [instanceId])]);
      mockWrite('post', restart, 409);

      expect(await run('instances', 'restart', instanceId)).toBe(1);
      expect(stderr()).toContain('still starting');
    });

    it('reports an unknown outcome when the request is lost', async () => {
      mockDaemons([daemon('worker', [instanceId])]);
      const fetch = client.fetch.bind(client);
      vi.spyOn(client, 'fetch').mockImplementation(((url: string, opts) =>
        url.includes('/restart')
          ? Promise.reject(new Error('socket hang up'))
          : fetch(url, opts)) as typeof client.fetch);

      expect(await run('instances', 'restart', instanceId)).toBe(1);
      expect(stderr()).toContain(
        "Couldn't confirm whether the restart was accepted."
      );
    });

    it('rejects an invalid instance ID before any request', async () => {
      const requests = mockWrite('post', restart, 202);

      expect(await run('instances', 'restart', 'not-an-id')).toBe(2);
      expect(requests).toEqual([]);
    });
  });
});
