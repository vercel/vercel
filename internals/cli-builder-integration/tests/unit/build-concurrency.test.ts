import os from 'node:os';
import { join } from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';

import {
  getInstallScopeKey,
  groupIntoScopeChains,
  resolveBuildConcurrency,
  resolveInstallScopeRoot,
  runBuildsWithConcurrency,
  runWithConcurrency,
  type InstallScope,
  type RunBuildsWithConcurrencyOptions,
} from '../../src/build-concurrency';

describe('resolveBuildConcurrency()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to 1 when unset or empty', () => {
    expect(resolveBuildConcurrency(undefined)).toBe(1);
    expect(resolveBuildConcurrency('')).toBe(1);
    expect(resolveBuildConcurrency('   ')).toBe(1);
  });

  it('degrades unparseable or non-positive values to 1', () => {
    expect(resolveBuildConcurrency('0')).toBe(1);
    expect(resolveBuildConcurrency('-2')).toBe(1);
    expect(resolveBuildConcurrency('abc')).toBe(1);
    expect(resolveBuildConcurrency('%')).toBe(1);
    expect(resolveBuildConcurrency('-50%')).toBe(1);
  });

  it('resolves percentages against availableParallelism', () => {
    vi.spyOn(os, 'availableParallelism').mockReturnValue(8);
    expect(resolveBuildConcurrency('50%')).toBe(4);
    expect(resolveBuildConcurrency('25%')).toBe(2);
    expect(resolveBuildConcurrency('1%')).toBe(1);
    expect(resolveBuildConcurrency('0%')).toBe(1);
  });

  it('accepts `auto`', () => {
    vi.spyOn(os, 'availableParallelism').mockReturnValue(4);
    expect(resolveBuildConcurrency('AUTO')).toBe(3);
    expect(resolveBuildConcurrency('Auto')).toBe(3);
  });

  it('resolves `auto` according to `availableParallelism`', () => {
    const cases: Array<[number, number]> = [
      // Clamped to P: a 1-CPU container is never oversubscribed.
      [1, 1],
      [2, 2],
      [4, 3],
      [9, 8],
      [32, 8],
    ];
    for (const [parallelism, expected] of cases) {
      vi.spyOn(os, 'availableParallelism').mockReturnValue(parallelism);
      expect(resolveBuildConcurrency('auto')).toBe(expected);
    }
  });
});

describe('runWithConcurrency()', () => {
  it('runs every item and resolves', async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async n => {
      seen.push(n);
    });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise(resolve =>
          setTimeout(() => {
            inFlight--;
            resolve(undefined);
          }, 5)
        );
      }
    );
    expect(maxInFlight).toBe(3);
  });

  it('rethrows the first error and starts no new items after it', async () => {
    const started: number[] = [];
    await expect(
      runWithConcurrency([1, 2, 3, 4, 5], 1, async n => {
        started.push(n);
        if (n === 2) throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(started).toEqual([1, 2]);
  });

  it('reports errors from other in-flight items', async () => {
    const secondary: Array<[unknown, number]> = [];
    await expect(
      runWithConcurrency(
        [1, 2],
        2,
        n =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`fail-${n}`)), n * 5)
          ),
        (err, item) => secondary.push([err, item])
      )
    ).rejects.toThrow('fail-1');
    expect(secondary).toHaveLength(1);
    expect(secondary[0][1]).toBe(2);
    expect((secondary[0][0] as Error).message).toBe('fail-2');
  });

  it('picks up items enqueued while the pool runs', async () => {
    const seen: number[] = [];
    await runWithConcurrency([1], 2, async (n, enqueue) => {
      seen.push(n);
      if (n === 1) {
        enqueue(2);
        enqueue(3);
      }
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('does not start enqueued items after a failure', async () => {
    const seen: number[] = [];
    await expect(
      runWithConcurrency([1], 1, async (n, enqueue) => {
        seen.push(n);
        enqueue(2);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(seen).toEqual([1]);
  });
});

describe('getInstallScopeKey()', () => {
  it('is equal only for the exact same (toolchain, directory, command) triple', () => {
    const a = getInstallScopeKey({
      toolchain: 'node',
      installDirectory: '/repo/web',
      installCommand: 'npm ci',
    });
    expect(
      getInstallScopeKey({
        toolchain: 'node',
        installDirectory: '/repo/web',
        installCommand: '  npm ci  ',
      })
    ).toBe(a);
    expect(
      getInstallScopeKey({
        toolchain: 'node',
        installDirectory: '/repo/api',
        installCommand: 'npm ci',
      })
    ).not.toBe(a);
    expect(
      getInstallScopeKey({
        toolchain: 'node',
        installDirectory: '/repo/web',
        installCommand: 'pnpm i',
      })
    ).not.toBe(a);
  });

  it('separates toolchains sharing a directory', () => {
    const node = getInstallScopeKey({
      toolchain: 'node',
      installDirectory: '/repo/svc',
      installCommand: undefined,
    });
    const python = getInstallScopeKey({
      toolchain: 'python',
      installDirectory: '/repo/svc',
      installCommand: undefined,
    });
    expect(node).not.toBe(python);
  });

  it('distinguishes the default install from an explicit empty command', () => {
    const dir = '/repo/web';
    const dflt = getInstallScopeKey({
      toolchain: 'node',
      installDirectory: dir,
      installCommand: undefined,
    });
    const empty = getInstallScopeKey({
      toolchain: 'node',
      installDirectory: dir,
      installCommand: '',
    });
    expect(dflt).not.toBe(empty);
    expect(
      getInstallScopeKey({
        toolchain: 'node',
        installDirectory: dir,
        installCommand: null,
      })
    ).toBe(dflt);
  });
});

describe('groupIntoScopeChains()', () => {
  interface Item {
    name: string;
    outer: string;
    inner: string;
    serialized?: boolean;
  }
  const scopeOf = (i: Item) => ({
    outerKey: i.outer,
    innerKey: i.inner,
    siblingsSkipInstall: !i.serialized,
  });
  const siblingNames = (siblingsOf: Map<Item, Item[]>) =>
    Object.fromEntries(
      [...siblingsOf].map(([leader, siblings]) => [
        leader.name,
        siblings.map(s => s.name),
      ])
    );

  it('gives every distinct outer scope one chain', () => {
    const items: Item[] = [
      { name: 'a', outer: 'o1', inner: 'i1' },
      { name: 'b', outer: 'o2', inner: 'i2' },
      { name: 'c', outer: 'o3', inner: 'i3' },
    ];
    const { chains, siblingsOf } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([['a'], ['b'], ['c']]);
    expect(siblingsOf.size).toBe(0);
  });

  it('defers default-install inner siblings behind their leader', () => {
    const items: Item[] = [
      { name: 'leader', outer: 'o1', inner: 'shared' },
      { name: 'other', outer: 'o2', inner: 'own' },
      { name: 'sibling1', outer: 'o1', inner: 'shared' },
      { name: 'sibling2', outer: 'o1', inner: 'shared' },
    ];
    const { chains, siblingsOf } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['leader'],
      ['other'],
    ]);
    expect(siblingNames(siblingsOf)).toEqual({
      leader: ['sibling1', 'sibling2'],
    });
  });

  it('chains workspace members', () => {
    // Two workspace members + a frontend share one install root: their
    // installs all mutate the root node_modules, so all three sub-scope
    // leaders serialize on one chain even though their directories differ.
    const items: Item[] = [
      { name: 'frontend', outer: 'node:/repo', inner: '/repo/frontend' },
      { name: 'api-a', outer: 'node:/repo', inner: '/repo/services/api-a' },
      { name: 'api-b', outer: 'node:/repo', inner: '/repo/services/api-b' },
      { name: 'py-a', outer: 'python:/repo', inner: '/repo/services/py-a' },
    ];
    const { chains, siblingsOf } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['frontend', 'api-a', 'api-b'],
      ['py-a'],
    ]);
    expect(siblingsOf.size).toBe(0);
  });

  it('keeps serialized-install extras on the chain instead of fanning out', () => {
    const items: Item[] = [
      { name: 'a', outer: 'o1', inner: 'shared', serialized: true },
      { name: 'b', outer: 'o1', inner: 'shared', serialized: true },
      { name: 'c', outer: 'o2', inner: 'own', serialized: true },
      { name: 'd', outer: 'o1', inner: 'shared', serialized: true },
    ];
    const { chains, siblingsOf } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['a', 'b', 'd'],
      ['c'],
    ]);
    expect(siblingsOf.size).toBe(0);
  });

  it('mixes leaders, serialized extras, and deduped siblings correctly', () => {
    const items: Item[] = [
      { name: 'lead-dedup', outer: 'o1', inner: 'i-dedup' },
      { name: 'lead-serial', outer: 'o1', inner: 'i-serial', serialized: true },
      { name: 'sib-dedup', outer: 'o1', inner: 'i-dedup' },
      { name: 'sib-serial', outer: 'o1', inner: 'i-serial', serialized: true },
    ];
    const { chains, siblingsOf } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['lead-dedup', 'lead-serial', 'sib-serial'],
    ]);
    expect(siblingNames(siblingsOf)).toEqual({ 'lead-dedup': ['sib-dedup'] });
  });

  it('tracks inner sub-scopes per outer scope', () => {
    const items: Item[] = [
      { name: 'node-svc', outer: 'node:/repo', inner: 'shared-inner' },
      { name: 'py-svc', outer: 'python:/repo', inner: 'shared-inner' },
      { name: 'node-sib', outer: 'node:/repo', inner: 'shared-inner' },
    ];
    const { chains, siblingsOf } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['node-svc'],
      ['py-svc'],
    ]);
    expect(siblingNames(siblingsOf)).toEqual({ 'node-svc': ['node-sib'] });
  });
});

describe('resolveInstallScopeRoot()', () => {
  it('resolves a workspace member to the workspace root', async () => {
    const repo = await getWriteableDirectory();
    await fs.outputFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n');
    await fs.outputJSON(join(repo, 'services/api-a/package.json'), {});
    await fs.outputJSON(join(repo, 'services/api-b/package.json'), {});

    const [a, b] = await Promise.all(
      ['api-a', 'api-b'].map(name =>
        resolveInstallScopeRoot({
          toolchain: 'node',
          serviceDir: join(repo, 'services', name),
          ceilingDir: repo,
        })
      )
    );
    expect(a).toBe(repo);
    expect(b).toBe(repo);
  });

  it('resolves a standalone service to its own directory', async () => {
    const repo = await getWriteableDirectory();
    const standalone = join(repo, 'services/standalone');
    await fs.outputJSON(join(standalone, 'package.json'), {});
    await fs.outputFile(join(standalone, 'package-lock.json'), '{}');

    expect(
      await resolveInstallScopeRoot({
        toolchain: 'node',
        serviceDir: standalone,
        ceilingDir: repo,
      })
    ).toBe(standalone);
  });

  it('resolves uv workspace members to the workspace root', async () => {
    const repo = await getWriteableDirectory();
    await fs.outputFile(
      join(repo, 'pyproject.toml'),
      '[tool.uv.workspace]\nmembers = ["services/py-a"]\n'
    );
    await fs.outputFile(
      join(repo, 'services/py-a/pyproject.toml'),
      '[project]\nname = "py-a"\n'
    );

    expect(
      await resolveInstallScopeRoot({
        toolchain: 'python',
        serviceDir: join(repo, 'services/py-a'),
        ceilingDir: repo,
      })
    ).toBe(repo);
  });

  it('python and node roots at the same directory stay separate scopes', async () => {
    const repo = await getWriteableDirectory();
    await fs.outputFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n');
    await fs.outputFile(join(repo, 'pyproject.toml'), '[tool.uv.workspace]\n');
    await fs.outputJSON(join(repo, 'services/api/package.json'), {});
    await fs.outputFile(
      join(repo, 'services/py/pyproject.toml'),
      '[project]\nname = "py"\n'
    );

    expect(
      await resolveInstallScopeRoot({
        toolchain: 'node',
        serviceDir: join(repo, 'services/api'),
        ceilingDir: repo,
      })
    ).toBe(repo);
    expect(
      await resolveInstallScopeRoot({
        toolchain: 'python',
        serviceDir: join(repo, 'services/py'),
        ceilingDir: repo,
      })
    ).toBe(repo);
  });

  it('scopes non-node/python toolchains to their own directory', async () => {
    const repo = await getWriteableDirectory();
    await fs.outputJSON(join(repo, 'package.json'), { workspaces: ['*'] });
    await fs.outputFile(join(repo, 'pnpm-lock.yaml'), '');
    const svc = join(repo, 'services/go-api');
    await fs.outputFile(join(svc, 'go.mod'), 'module example.com/api\n');

    for (const toolchain of ['go', 'rust', 'ruby', 'container']) {
      expect(
        await resolveInstallScopeRoot({
          toolchain,
          serviceDir: svc,
          ceilingDir: repo,
        }),
        toolchain
      ).toBe(svc);
    }
  });

  it('scopes an unknown toolchain to the repo root', async () => {
    const repo = await getWriteableDirectory();
    const svc = join(repo, 'services/a');
    await fs.ensureDir(svc);
    expect(
      await resolveInstallScopeRoot({
        toolchain: 'zig',
        serviceDir: svc,
        ceilingDir: repo,
      })
    ).toBe(repo);
  });

  it('bails to the service directory when it is not under the ceiling', async () => {
    const repo = await getWriteableDirectory();
    const elsewhere = await getWriteableDirectory();
    const svc = join(elsewhere, 'svc');
    await fs.mkdirp(svc);
    expect(
      await resolveInstallScopeRoot({
        toolchain: 'node',
        serviceDir: svc,
        ceilingDir: repo,
      })
    ).toBe(svc);
  });
});

describe('runBuildsWithConcurrency()', () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const settle = () => new Promise<void>(res => setImmediate(res));

  function makeControlledBuilds(scopes: Record<string, InstallScope>) {
    const calls: Array<{ build: string; concurrent: boolean }> = [];
    const inFlight = new Set<string>();
    const deferreds = new Map<string, ReturnType<typeof deferred>>();
    const secondaryErrors: Array<{ err: unknown; build: string }> = [];
    const options: Omit<
      RunBuildsWithConcurrencyOptions<string>,
      'builds' | 'concurrency' | 'isEligible' | 'forceSingleChain'
    > = {
      resolveScope: async build => scopes[build]!,
      runBuild: (build, concurrent) => {
        calls.push({ build, concurrent });
        inFlight.add(build);
        const d = deferred();
        deferreds.set(build, d);
        return d.promise.finally(() => inFlight.delete(build));
      },
      log: () => undefined,
      reportSecondaryError: (err, build) => {
        secondaryErrors.push({ err, build });
      },
    };
    return {
      options,
      calls,
      inFlight,
      secondaryErrors,
      started: () => calls.map(c => c.build),
      finish: async (build: string) => {
        deferreds.get(build)!.resolve();
        await settle();
      },
      fail: async (build: string, err: unknown) => {
        deferreds.get(build)!.reject(err);
        await settle();
      },
    };
  }

  const scope = (
    outerKey: string,
    innerKey = outerKey,
    siblingsSkipInstall = false
  ): InstallScope => ({ outerKey, innerKey, siblingsSkipInstall });

  it('concurrency <= 1 runs everything sequentially in order', async () => {
    const h = makeControlledBuilds({});
    const resolveScope = vi.fn();
    const run = runBuildsWithConcurrency({
      ...h.options,
      resolveScope,
      builds: ['a', 'b', 'c'],
      concurrency: 1,
      isEligible: () => true,
      forceSingleChain: false,
    });
    await settle();
    expect(h.calls).toEqual([{ build: 'a', concurrent: false }]);
    await h.finish('a');
    expect(h.started()).toEqual(['a', 'b']);
    await h.finish('b');
    await h.finish('c');
    await run;
    expect(h.calls).toEqual([
      { build: 'a', concurrent: false },
      { build: 'b', concurrent: false },
      { build: 'c', concurrent: false },
    ]);
    expect(resolveScope).not.toHaveBeenCalled();
  });

  it('never overlaps two builds of the same chain, while distinct chains run concurrently', async () => {
    const h = makeControlledBuilds({
      a1: scope('A', 'A/1'),
      a2: scope('A', 'A/2'),
      b1: scope('B'),
    });
    const run = runBuildsWithConcurrency({
      ...h.options,
      builds: ['a1', 'a2', 'b1'],
      concurrency: 4,
      isEligible: () => true,
      forceSingleChain: false,
    });
    await settle();
    // Both chains started their first build; a2 waits for its chain-mate.
    expect(h.started().sort()).toEqual(['a1', 'b1']);
    expect(h.inFlight.has('a2')).toBe(false);
    await h.finish('a1');
    expect(h.started()).toContain('a2');
    expect(h.calls.every(c => c.concurrent)).toBe(true);
    await h.finish('a2');
    await h.finish('b1');
    await run;
  });

  it('fans a deferred sibling out as soon as its leader finishes', async () => {
    const h = makeControlledBuilds({
      leader: scope('A', 'A/shared', true),
      sibling: scope('A', 'A/shared', true),
      other: scope('B'),
    });
    const run = runBuildsWithConcurrency({
      ...h.options,
      builds: ['leader', 'sibling', 'other'],
      concurrency: 4,
      isEligible: () => true,
      forceSingleChain: false,
    });
    await settle();
    expect(h.started().sort()).toEqual(['leader', 'other']);
    expect(h.inFlight.has('sibling')).toBe(false);
    // Leader done, so the sibling joins the pool while chain B is still running.
    await h.finish('leader');
    expect(h.started()).toContain('sibling');
    expect(h.inFlight.has('other')).toBe(true);
    await h.finish('other');
    await h.finish('sibling');
    await run;
  });

  it('holds a deferred sibling until its own leader finishes, even when the pool has idle capacity', async () => {
    const h = makeControlledBuilds({
      a1: scope('A', 'A/1'),
      leader: scope('A', 'A/shared', true),
      sibling: scope('A', 'A/shared', true),
    });
    const run = runBuildsWithConcurrency({
      ...h.options,
      builds: ['a1', 'leader', 'sibling'],
      concurrency: 4,
      isEligible: () => true,
      forceSingleChain: false,
    });
    await settle();
    // One chain: [a1, leader]. The sibling waits on the leader, not on a1.
    expect(h.started()).toEqual(['a1']);
    await h.finish('a1');
    expect(h.started()).toEqual(['a1', 'leader']);
    expect(h.inFlight.has('sibling')).toBe(false);
    await h.finish('leader');
    expect(h.started()).toContain('sibling');
    await h.finish('sibling');
    await run;
  });

  it('runs ineligible builds sequentially AFTER the parallel phase', async () => {
    const h = makeControlledBuilds({ par1: scope('A'), par2: scope('B') });
    const run = runBuildsWithConcurrency({
      ...h.options,
      builds: ['static', 'par1', 'par2'],
      concurrency: 4,
      isEligible: build => build !== 'static',
      forceSingleChain: false,
    });
    await settle();
    expect(h.started().sort()).toEqual(['par1', 'par2']);
    await h.finish('par1');
    expect(h.started()).not.toContain('static');
    await h.finish('par2');
    expect(h.calls.at(-1)).toEqual({ build: 'static', concurrent: false });
    await h.finish('static');
    await run;
  });

  it('an in-flight chain whose current build SUCCEEDS after another chain failed must not start its next build', async () => {
    const h = makeControlledBuilds({
      a1: scope('A'),
      b1: scope('B', 'B/1'),
      b2: scope('B', 'B/2'),
    });
    const run = runBuildsWithConcurrency({
      ...h.options,
      builds: ['a1', 'b1', 'b2'],
      concurrency: 4,
      isEligible: () => true,
      forceSingleChain: false,
    });
    const outcome = run.then(
      () => undefined,
      err => err
    );
    await settle();
    const firstError = new Error('a1 exploded');
    await h.fail('a1', firstError);
    // b1 completes successfully but the run is already doomed.
    await h.finish('b1');
    expect(h.started()).not.toContain('b2');
    expect(h.secondaryErrors).toEqual([]);
    expect(await outcome).toBe(firstError);
  });

  it('reports fanned-out sibling failures through reportSecondaryError after a first failure', async () => {
    const h = makeControlledBuilds({
      leader: scope('A', 'A/shared', true),
      sib1: scope('A', 'A/shared', true),
      sib2: scope('A', 'A/shared', true),
    });
    const run = runBuildsWithConcurrency({
      ...h.options,
      builds: ['leader', 'sib1', 'sib2'],
      concurrency: 4,
      isEligible: () => true,
      forceSingleChain: false,
    });
    const outcome = run.then(
      () => undefined,
      err => err
    );
    await settle();
    await h.finish('leader');
    // Both siblings fan out concurrently after their leader.
    expect(h.started().sort()).toEqual(['leader', 'sib1', 'sib2']);
    const firstError = new Error('sib1 failed');
    await h.fail('sib1', firstError);
    const secondError = new Error('sib2 failed');
    await h.fail('sib2', secondError);
    expect(h.secondaryErrors).toEqual([{ err: secondError, build: 'sib2' }]);
    expect(await outcome).toBe(firstError);
  });
});
