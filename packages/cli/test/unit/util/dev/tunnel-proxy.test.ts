import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeployment } from '@vercel/client';
import type { Org } from '@vercel-internals/types';
import type Client from '../../../../src/util/client';
import output from '../../../../src/output-manager';
import { PROXY_META } from '../../../../src/util/dev/tunnel/alias';
import {
  proxyDeployer,
  type TunnelAlias,
} from '../../../../src/util/dev/tunnel/proxy';
import { APIError } from '../../../../src/util/errors-ts';
import {
  proxyRecordPath,
  readProxy,
  rememberProxy,
} from '../../../../src/util/dev/tunnel/reuse';

vi.mock('@vercel/client', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/client')>()),
  createDeployment: vi.fn(),
}));

const org = { id: 'team_1', slug: 'team', type: 'team' } as Org;
const env = { DEV_TUNNEL_PORT: '3000' };

let dir: string;
let record: string;
interface Deployment {
  readyState: string;
  createdAt: number;
  meta?: Record<string, string>;
  creator?: { uid: string };
  target?: string;
}
let deployments: Map<string, Deployment>;
// Each alias, and the deployment it points at: none for a redirect.
let aliases: Map<string, string | null>;
// Aliases another account holds, which the team can't see or assign.
let foreign: Set<string>;
// Whether api-dev-tunnel takes alias reservations, and the names another
// developer's tunnel holds a lease on.
let leasing: boolean;
// Whether the project has a deployment, so a proxy won't be its first.
let everDeployed: boolean;
let listed: number;
let leasedElsewhere: Set<string>;
let deleted: string[];
// Alias assignments and deletes, in the order the API got them.
let calls: string[];
let deploys: { path: string; env: unknown; meta: unknown }[];
let client: Client;

const notFound = () =>
  new APIError('Not Found', new Response(null, { status: 404 }));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tunnel-proxy-'));
  record = proxyRecordPath(org.id, 'prj_1', dir);
  deployments = new Map();
  aliases = new Map();
  foreign = new Set();
  leasing = false;
  everDeployed = true;
  listed = 0;
  leasedElsewhere = new Set();
  deleted = [];
  calls = [];
  deploys = [];
  client = {
    apiUrl: 'https://api.vercel.com',
    authConfig: { token: 'token' },
    fetch: vi.fn(
      async (url: string, init?: { method?: string; body?: unknown }) => {
        if (url.startsWith('/v1/dev-tunnel/aliases')) {
          if (!leasing) throw notFound();
          if (init?.method === 'DELETE') {
            const alias = decodeURIComponent(url.split('/')[4].split('?')[0]);
            calls.push(`release ${alias}`);
            return {};
          }
          const { alias } = init?.body as { alias: string };
          if (leasedElsewhere.has(alias)) {
            throw new APIError(
              'Another tunnel holds this alias',
              new Response(null, { status: 409 })
            );
          }
          calls.push(`lease ${alias}`);
          return { alias, expiresAt: new Date().toISOString() };
        }
        if (url.startsWith('/v6/deployments?')) {
          listed += 1;
          return { deployments: everDeployed ? [{ uid: 'dpl_0' }] : [] };
        }
        const aliasing = url.match(/^\/v2\/deployments\/([^/]+)\/aliases$/);
        if (aliasing && init?.method === 'POST') {
          const { alias } = init.body as { alias: string };
          if (foreign.has(alias)) {
            throw new APIError(
              'The domain is not allowed to be used',
              new Response(null, { status: 409 })
            );
          }
          const id = decodeURIComponent(aliasing[1]);
          calls.push(`alias ${alias} -> ${id}`);
          aliases.set(alias, id);
          return { alias };
        }
        const lookup = url.match(/^\/v4\/aliases\/([^/]+)$/);
        if (lookup) {
          const name = decodeURIComponent(lookup[1]);
          if (!aliases.has(name)) throw notFound();
          const deploymentId = aliases.get(name);
          return deploymentId
            ? { deploymentId }
            : { deploymentId: null, redirect: 'https://example.com' };
        }
        const id = decodeURIComponent(url.split('/').pop() ?? '');
        if (init?.method === 'DELETE') {
          deleted.push(id);
          calls.push(`delete ${id}`);
          deployments.delete(id);
          return {};
        }
        const deployment = deployments.get(id);
        if (!deployment) throw notFound();
        return deployment;
      }
    ),
  } as unknown as Client;
  vi.mocked(createDeployment).mockImplementation(async function* (
    clientOptions,
    deploymentOptions
  ) {
    const id = `dpl_${deploys.length + 1}`;
    const options = await deploymentOptions;
    deploys.push({
      // One directory, never a list of files.
      path: clientOptions.path as string,
      env: options?.env,
      meta: options?.meta,
    });
    deployments.set(id, {
      readyState: 'READY',
      createdAt: Date.now(),
      meta: options?.meta,
      creator: { uid: USER },
    });
    yield {
      type: 'created',
      payload: { id, url: `${id}.vercel.app`, inspectorUrl: `https://i/${id}` },
    };
    yield { type: 'ready', payload: { id, url: `${id}.vercel.app` } };
  } as typeof createDeployment);
  vi.spyOn(output, 'print').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const deployer = (
  rootDirectory?: string,
  signal?: AbortSignal,
  alias?: TunnelAlias
) =>
  proxyDeployer({
    client,
    org,
    projectId: 'prj_1',
    projectName: 'project',
    rootDirectory,
    env,
    record,
    signal,
    alias,
  });

const USER = 'user_1';

// Previews made before the test, e.g. by an earlier run.
const seed = (...ids: string[]) => {
  for (const id of ids) {
    deployments.set(id, {
      readyState: 'READY',
      createdAt: Date.now(),
      creator: { uid: USER },
    });
  }
};
const LABEL = 'project-tunnel-eddie-team';
const TUNNEL_ALIAS = { label: LABEL, userId: USER };
// Under the suffix of the proxies' own URLs.
const ALIAS = `${LABEL}.vercel.app`;

describe('proxyDeployer', () => {
  it('deploys a preview with the routes and env, and remembers it', async () => {
    const url = await deployer()([{ src: '/a', dest: '/b' }]);

    expect(url).toBe('https://dpl_1.vercel.app');
    expect(deploys).toHaveLength(1);
    expect(deploys[0].env).toEqual(env);
    const config = JSON.parse(
      await readFile(join(deploys[0].path, 'vercel.json'), 'utf8')
    );
    expect(config.routes).toContainEqual({ src: '/a', dest: '/b' });
    expect(await readProxy(record)).toMatchObject({ id: 'dpl_1', url });
  });

  it('nests the files under the Root Directory', async () => {
    await deployer('apps/web')([]);

    expect(
      await readFile(join(deploys[0].path, 'apps/web/api/tunnel.ts'), 'utf8')
    ).toContain('export default');
  });

  it('keeps the proxy in use while the routes stay the same', async () => {
    const proxyFor = deployer();
    await proxyFor([]);
    vi.mocked(client.fetch).mockClear();
    await proxyFor([]);

    expect(deploys).toHaveLength(1);
    // Without even asking the API whether it's still there.
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it("reuses the last run's proxy while it fits", async () => {
    await deployer()([]);
    const url = await deployer()([]);

    expect(url).toBe('https://dpl_1.vercel.app');
    expect(deploys).toHaveLength(1);
  });

  it('deploys again when the routes change, and deletes the one it replaces', async () => {
    const proxyFor = deployer();
    await proxyFor([]);
    const url = await proxyFor([{ src: '/a', dest: '/b' }]);

    expect(url).toBe('https://dpl_2.vercel.app');
    await vi.waitFor(() => expect(deleted).toEqual(['dpl_1']));
    expect(await readProxy(record)).toMatchObject({ id: 'dpl_2' });
  });

  it("won't deploy a project's first deployment, which would be production", async () => {
    everDeployed = false;

    await expect(deployer()([])).rejects.toMatchObject({
      message:
        "Can't deploy the tunnel proxy. project has never been deployed, so its first deployment would be production. Deploy it once with `vercel deploy`, then run `vercel dev --tunnel` again.",
    });
    expect(deploys).toHaveLength(0);
  });

  it('checks for an earlier deployment once a run', async () => {
    const proxyFor = deployer();
    await proxyFor([]);
    await proxyFor([{ src: '/a', dest: '/b' }]);

    expect(listed).toBe(1);
  });

  it("doesn't reuse a proxy that became production, nor delete it", async () => {
    await deployer()([]);
    // As if this run's proxy was the project's first deployment.
    deployments.set('dpl_1', {
      readyState: 'READY',
      createdAt: Date.now(),
      creator: { uid: USER },
      target: 'production',
    });

    expect(await deployer()([])).toBe('https://dpl_2.vercel.app');
    // Given the time a delete would take.
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(deleted).toEqual([]);
    expect(deployments.has('dpl_1')).toBe(true);
  });

  it('deploys again when the remembered proxy is gone', async () => {
    await deployer()([]);
    deployments.delete('dpl_1');

    expect(await deployer()([])).toBe('https://dpl_2.vercel.app');
  });

  it('remembers a deploy that Ctrl-C stops, and what it replaces', async () => {
    await deployer()([]);
    vi.mocked(createDeployment).mockImplementation(async function* () {
      yield {
        type: 'created',
        payload: { id: 'dpl_stopped', url: 'dpl_stopped.vercel.app' },
      };
      await new Promise(() => {});
    } as typeof createDeployment);
    const controller = new AbortController();
    const deploying = deployer(
      undefined,
      controller.signal
    )([{ src: '/a', dest: '/b' }]);
    await vi.waitFor(async () =>
      expect(await readProxy(record)).toMatchObject({ id: 'dpl_stopped' })
    );

    controller.abort();

    await expect(deploying).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readProxy(record)).toMatchObject({
      id: 'dpl_stopped',
      url: 'https://dpl_stopped.vercel.app',
      replaces: ['dpl_1'],
    });
    expect(deleted).toEqual([]);
  });

  it('deletes the proxy a stopped run was replacing, from an older record', async () => {
    await deployer()([]);
    const proxy = await readProxy(record);
    await writeFile(record, JSON.stringify({ ...proxy, replaces: 'dpl_old' }));
    seed('dpl_old');

    expect(await deployer()([])).toBe('https://dpl_1.vercel.app');
    await vi.waitFor(() => expect(deleted).toEqual(['dpl_old']));
    expect(await readProxy(record)).not.toHaveProperty('replaces');
  });

  it('starts no deploy once the signal has aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(deployer(undefined, controller.signal)([])).rejects.toThrow();
    expect(deploys).toEqual([]);
  });

  it('says where to look when the deployment fails', async () => {
    vi.mocked(createDeployment).mockImplementation(async function* () {
      yield { type: 'created', payload: { inspectorUrl: 'https://i/dpl_x' } };
      yield { type: 'error', payload: { message: 'Build failed' } };
    } as typeof createDeployment);

    await expect(deployer()([])).rejects.toMatchObject({
      message: 'Failed to deploy the tunnel proxy.',
      remote: { source: 'Deployment', message: 'Build failed' },
      inspectorUrl: 'https://i/dpl_x',
    });
    expect(await readProxy(record)).toBeUndefined();
  });

  it('says a canceled deployment was canceled', async () => {
    vi.mocked(createDeployment).mockImplementation(async function* () {
      yield { type: 'canceled', payload: {} };
    } as typeof createDeployment);

    await expect(deployer()([])).rejects.toMatchObject({
      message: 'The tunnel proxy deployment was canceled.',
      remote: undefined,
    });
  });

  describe('with an alias', () => {
    it('gives the proxy the alias, and resolves with it', async () => {
      const url = await deployer(undefined, undefined, TUNNEL_ALIAS)([]);

      expect(url).toBe(`https://${ALIAS}`);
      expect(calls).toEqual([`alias ${ALIAS} -> dpl_1`]);
      // The proxy itself is remembered, not the alias.
      expect(await readProxy(record)).toMatchObject({
        id: 'dpl_1',
        url: 'https://dpl_1.vercel.app',
      });
    });

    it('keeps the URL when the routes change, moving the alias before deleting the old proxy', async () => {
      const proxyFor = deployer(undefined, undefined, TUNNEL_ALIAS);
      await proxyFor([]);
      const print = vi.mocked(output.print);
      print.mockClear();

      const url = await proxyFor([{ src: '/a', dest: '/b' }]);

      expect(url).toBe(`https://${ALIAS}`);
      await vi.waitFor(() =>
        expect(calls).toEqual([
          `alias ${ALIAS} -> dpl_1`,
          `alias ${ALIAS} -> dpl_2`,
          'delete dpl_1',
        ])
      );
      expect(print).toHaveBeenCalledWith(
        '  The tunnel serves the new routes\n'
      );
    });

    it("moves the alias off a stopped run's proxies before deleting them", async () => {
      // A replacement was stopped mid-deploy: the proxy it was replacing
      // still holds the alias.
      await rememberProxy(record, {
        key: 'other routes',
        id: 'dpl_stopped',
        url: 'https://dpl_stopped.vercel.app',
        replaces: ['dpl_serving'],
      });
      seed('dpl_stopped', 'dpl_serving');

      expect(await deployer(undefined, undefined, TUNNEL_ALIAS)([])).toBe(
        `https://${ALIAS}`
      );
      await vi.waitFor(() =>
        expect(calls).toEqual([
          `alias ${ALIAS} -> dpl_1`,
          'delete dpl_stopped',
          'delete dpl_serving',
        ])
      );
      expect(await readProxy(record)).not.toHaveProperty('replaces');
    });

    it("moves the alias to a stopped run's proxy it reuses before deleting the one it replaced", async () => {
      await deployer()([]);
      const proxy = await readProxy(record);
      await writeFile(
        record,
        JSON.stringify({ ...proxy, replaces: ['dpl_serving'] })
      );
      seed('dpl_serving');

      expect(await deployer(undefined, undefined, TUNNEL_ALIAS)([])).toBe(
        `https://${ALIAS}`
      );
      await vi.waitFor(() =>
        expect(calls).toEqual([`alias ${ALIAS} -> dpl_1`, 'delete dpl_serving'])
      );
    });

    it("gives the alias to the last run's proxy it reuses", async () => {
      await deployer()([]);

      expect(await deployer(undefined, undefined, TUNNEL_ALIAS)([])).toBe(
        `https://${ALIAS}`
      );
      expect(deploys).toHaveLength(1);
      expect(calls).toEqual([`alias ${ALIAS} -> dpl_1`]);
    });

    it("keeps the proxy holding the alias when it can't move, until it does", async () => {
      const proxyFor = deployer(undefined, undefined, TUNNEL_ALIAS);
      await proxyFor([]);
      const fetch = vi.mocked(client.fetch);
      const answer = fetch.getMockImplementation()!;
      fetch.mockImplementation(async (url, init) => {
        if (url.endsWith('/aliases')) throw new Error('timed out');
        return answer(url, init);
      });
      vi.spyOn(output, 'warning').mockImplementation(() => {});

      expect(await proxyFor([{ src: '/a', dest: '/b' }])).toBe(
        'https://dpl_2.vercel.app'
      );
      // The alias still points at dpl_1, so it stays.
      expect(deleted).toEqual([]);
      expect(await readProxy(record)).toMatchObject({
        id: 'dpl_2',
        replaces: ['dpl_1'],
      });

      fetch.mockImplementation(answer);
      expect(await proxyFor([{ src: '/c', dest: '/d' }])).toBe(
        `https://${ALIAS}`
      );
      await vi.waitFor(() =>
        expect(deleted.sort()).toEqual(['dpl_1', 'dpl_2'])
      );
      expect(await readProxy(record)).not.toHaveProperty('replaces');
    });

    it("falls back to the proxy's own URL when the alias can't be assigned", async () => {
      const fetch = vi.mocked(client.fetch);
      const answer = fetch.getMockImplementation()!;
      fetch.mockImplementation(async (url, init) => {
        if (url.endsWith('/aliases')) throw new Error('alias_in_use');
        return answer(url, init);
      });
      const warning = vi.spyOn(output, 'warning').mockImplementation(() => {});

      const url = await deployer(undefined, undefined, TUNNEL_ALIAS)([]);

      expect(url).toBe('https://dpl_1.vercel.app');
      expect(warning).toHaveBeenCalledWith(
        `Couldn't point ${ALIAS} at the tunnel's proxy, so its URL changes with each deploy.\nReason: alias_in_use`
      );
    });

    it('releases the lease on a chosen alias, and only on a chosen one', async () => {
      leasing = true;
      const chosen = deployer(undefined, undefined, {
        ...TUNNEL_ALIAS,
        chosen: true,
      });
      await chosen([]);
      await chosen.release();
      expect(calls).toEqual([
        `lease ${ALIAS}`,
        `alias ${ALIAS} -> dpl_1`,
        `release ${ALIAS}`,
      ]);

      calls.length = 0;
      const byDefault = deployer(undefined, undefined, TUNNEL_ALIAS);
      await byDefault([{ src: '/a', dest: '/b' }]);
      await byDefault.release();
      expect(
        calls.filter(call => !call.startsWith('alias'))
      ).not.toContainEqual(expect.stringMatching(/^(lease|release) /));
    });

    it('marks each proxy, so a later run knows its own', async () => {
      await deployer(undefined, undefined, TUNNEL_ALIAS)([]);

      expect(deploys[0].meta).toEqual(PROXY_META);
    });

    describe('that already points at a deployment', () => {
      const pointAt = (id: string, deployment?: Partial<Deployment>) => {
        aliases.set(ALIAS, id);
        if (deployment) {
          deployments.set(id, {
            readyState: 'READY',
            createdAt: Date.now(),
            ...deployment,
          });
        }
      };

      it("won't take a chosen one from a teammate's tunnel", async () => {
        pointAt('dpl_theirs', {
          meta: PROXY_META,
          creator: { uid: 'user_2' },
        });

        await expect(
          deployer(undefined, undefined, { ...TUNNEL_ALIAS, chosen: true })([])
        ).rejects.toMatchObject({
          message: `Can't use ${ALIAS} for the tunnel. It points at another deployment.`,
        });
        expect(aliases.get(ALIAS)).toBe('dpl_theirs');
      });

      it('keeps its own URL rather than take the default one from a branch preview', async () => {
        pointAt('dpl_branch', { creator: { uid: USER } });
        const warning = vi
          .spyOn(output, 'warning')
          .mockImplementation(() => {});

        expect(await deployer(undefined, undefined, TUNNEL_ALIAS)([])).toBe(
          'https://dpl_1.vercel.app'
        );
        expect(aliases.get(ALIAS)).toBe('dpl_branch');
        expect(warning).toHaveBeenCalledWith(
          `Can't use ${ALIAS} for the tunnel. It points at another deployment. The tunnel's URL changes with each deploy.`
        );
      });

      it("won't replace a redirect, which points at no deployment", async () => {
        aliases.set(ALIAS, null);

        await expect(
          deployer(undefined, undefined, { ...TUNNEL_ALIAS, chosen: true })([])
        ).rejects.toMatchObject({
          message: `Can't use ${ALIAS} for the tunnel. It points at another deployment.`,
        });
        expect(aliases.get(ALIAS)).toBeNull();
      });

      it('lets go of one taken mid-session rather than take it back', async () => {
        const proxyFor = deployer(undefined, undefined, {
          ...TUNNEL_ALIAS,
          chosen: true,
        });
        await proxyFor([]);
        pointAt('dpl_theirs', { creator: { uid: 'user_2' } });
        const warning = vi
          .spyOn(output, 'warning')
          .mockImplementation(() => {});

        expect(await proxyFor([{ src: '/a', dest: '/b' }])).toBe(
          'https://dpl_2.vercel.app'
        );
        expect(aliases.get(ALIAS)).toBe('dpl_theirs');
        expect(warning).toHaveBeenCalledWith(
          `Can't use ${ALIAS} for the tunnel. It points at another deployment. The tunnel's URL changes with each deploy.`
        );
      });

      it('refuses a chosen one another account holds, which the lookup misses', async () => {
        foreign.add(ALIAS);

        await expect(
          deployer(undefined, undefined, { ...TUNNEL_ALIAS, chosen: true })([])
        ).rejects.toMatchObject({
          message: `Couldn't use ${ALIAS} for the tunnel.`,
          remote: {
            source: 'Vercel API',
            message: 'The domain is not allowed to be used',
          },
        });
      });

      it('keeps its own URL when another account holds the default one', async () => {
        foreign.add(ALIAS);
        vi.spyOn(output, 'warning').mockImplementation(() => {});

        expect(await deployer(undefined, undefined, TUNNEL_ALIAS)([])).toBe(
          'https://dpl_1.vercel.app'
        );
      });

      it("won't take a chosen one another developer's tunnel holds a lease on", async () => {
        leasing = true;
        leasedElsewhere.add(ALIAS);

        await expect(
          deployer(undefined, undefined, { ...TUNNEL_ALIAS, chosen: true })([])
        ).rejects.toMatchObject({
          message: `Can't use ${ALIAS} for the tunnel. Another developer's tunnel holds it.`,
        });
        expect(calls).toEqual([]);
      });

      it("takes a chosen one from a teammate's tunnel once their lease is gone", async () => {
        leasing = true;
        pointAt('dpl_theirs', {
          meta: PROXY_META,
          creator: { uid: 'user_2' },
        });

        expect(
          await deployer(undefined, undefined, {
            ...TUNNEL_ALIAS,
            chosen: true,
          })([])
        ).toBe(`https://${ALIAS}`);
        expect(calls).toEqual([`lease ${ALIAS}`, `alias ${ALIAS} -> dpl_1`]);
      });

      it("releases a lease it took for a name it then can't use", async () => {
        leasing = true;
        pointAt('dpl_branch', { creator: { uid: USER } });

        await expect(
          deployer(undefined, undefined, { ...TUNNEL_ALIAS, chosen: true })([])
        ).rejects.toMatchObject({
          message: `Can't use ${ALIAS} for the tunnel. It points at another deployment.`,
        });
        expect(calls).toEqual([`lease ${ALIAS}`, `release ${ALIAS}`]);
      });

      it('releases its lease when the chosen one fails to assign', async () => {
        leasing = true;
        foreign.add(ALIAS);

        await expect(
          deployer(undefined, undefined, { ...TUNNEL_ALIAS, chosen: true })([])
        ).rejects.toMatchObject({
          message: `Couldn't use ${ALIAS} for the tunnel.`,
        });
        expect(calls).toEqual([`lease ${ALIAS}`, `release ${ALIAS}`]);
      });

      it('falls back rather than stop a resumed tunnel', async () => {
        pointAt('dpl_theirs', {
          meta: PROXY_META,
          creator: { uid: 'user_2' },
        });
        vi.spyOn(output, 'warning').mockImplementation(() => {});

        expect(
          await deployer(undefined, undefined, {
            ...TUNNEL_ALIAS,
            chosen: true,
            resumed: true,
          })([])
        ).toBe('https://dpl_1.vercel.app');
      });

      it("takes it from the developer's own proxy, or a deleted deployment", async () => {
        pointAt('dpl_elsewhere', {
          meta: PROXY_META,
          creator: { uid: USER },
        });
        expect(
          await deployer(undefined, undefined, {
            ...TUNNEL_ALIAS,
            chosen: true,
          })([])
        ).toBe(`https://${ALIAS}`);

        aliases.set(ALIAS, 'dpl_gone');
        expect(
          await deployer(undefined, undefined, {
            ...TUNNEL_ALIAS,
            chosen: true,
          })([{ src: '/a', dest: '/b' }])
        ).toBe(`https://${ALIAS}`);
      });
    });
  });
});
