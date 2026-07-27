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
  runWithConcurrency,
} from '../../../../src/util/build/build-concurrency';
import { mergeWorkerMeta } from '../../../../src/util/build/builder-process';

describe('resolveBuildConcurrency()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to 1 when unset or empty', () => {
    expect(resolveBuildConcurrency(undefined)).toBe(1);
    expect(resolveBuildConcurrency('')).toBe(1);
    expect(resolveBuildConcurrency('   ')).toBe(1);
  });

  it('parses positive integers, flooring fractions', () => {
    expect(resolveBuildConcurrency('4')).toBe(4);
    expect(resolveBuildConcurrency(' 2 ')).toBe(2);
    expect(resolveBuildConcurrency('3.9')).toBe(3);
  });

  it('degrades unparseable or non-positive values to 1, never parallel', () => {
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
    // Never below 1, even for tiny percentages.
    expect(resolveBuildConcurrency('1%')).toBe(1);
  });

  it('falls back to os.cpus().length when availableParallelism is unavailable (Node < 18.14)', () => {
    const original = os.availableParallelism;
    // @ts-expect-error -- simulating Node 18.0–18.13, where the API is absent
    os.availableParallelism = undefined;
    vi.spyOn(os, 'cpus').mockReturnValue(
      new Array(6).fill({}) as ReturnType<typeof os.cpus>
    );
    try {
      expect(resolveBuildConcurrency('50%')).toBe(3);
      expect(resolveBuildConcurrency('auto')).toBe(5);
    } finally {
      os.availableParallelism = original;
    }
  });

  it('resolves `auto` to min(max(P - 1, 2), 8)', () => {
    const cases: Array<[number, number]> = [
      [1, 2],
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

  it('fails fast: rethrows the first error and starts no new items after it', async () => {
    const started: number[] = [];
    await expect(
      runWithConcurrency([1, 2, 3, 4, 5], 1, async n => {
        started.push(n);
        if (n === 2) throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(started).toEqual([1, 2]);
  });

  it('reports (not swallows) errors from other in-flight items', async () => {
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

  it('handles an empty item list', async () => {
    const fn = vi.fn();
    await runWithConcurrency([], 4, fn);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('getInstallScopeKey()', () => {
  it('is equal only for the exact same (directory, command) pair', () => {
    const a = getInstallScopeKey({
      installDirectory: '/repo/web',
      installCommand: 'npm ci',
    });
    expect(
      getInstallScopeKey({
        installDirectory: '/repo/web',
        installCommand: '  npm ci  ',
      })
    ).toBe(a);
    expect(
      getInstallScopeKey({
        installDirectory: '/repo/api',
        installCommand: 'npm ci',
      })
    ).not.toBe(a);
    expect(
      getInstallScopeKey({
        installDirectory: '/repo/web',
        installCommand: 'pnpm i',
      })
    ).not.toBe(a);
  });

  it('distinguishes the default install from an explicit empty command', () => {
    const dir = '/repo/web';
    const dflt = getInstallScopeKey({
      installDirectory: dir,
      installCommand: undefined,
    });
    const empty = getInstallScopeKey({
      installDirectory: dir,
      installCommand: '',
    });
    expect(dflt).not.toBe(empty);
    expect(
      getInstallScopeKey({ installDirectory: dir, installCommand: null })
    ).toBe(dflt);
  });
});

describe('groupIntoScopeChains()', () => {
  interface Item {
    name: string;
    outer: string;
    inner: string;
    custom?: boolean;
  }
  const scopeOf = (i: Item) => ({
    outerKey: i.outer,
    innerKey: i.inner,
    customInstall: Boolean(i.custom),
  });

  it('gives every distinct outer scope one chain, in first-seen order', () => {
    const items: Item[] = [
      { name: 'a', outer: 'o1', inner: 'i1' },
      { name: 'b', outer: 'o2', inner: 'i2' },
      { name: 'c', outer: 'o3', inner: 'i3' },
    ];
    const { chains, rest } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([['a'], ['b'], ['c']]);
    expect(rest).toEqual([]);
  });

  it('sends default-install inner siblings to `rest` (fan out after chains)', () => {
    const items: Item[] = [
      { name: 'leader', outer: 'o1', inner: 'shared' },
      { name: 'other', outer: 'o2', inner: 'own' },
      { name: 'sibling1', outer: 'o1', inner: 'shared' },
      { name: 'sibling2', outer: 'o1', inner: 'shared' },
    ];
    const { chains, rest } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['leader'],
      ['other'],
    ]);
    expect(rest.map(i => i.name)).toEqual(['sibling1', 'sibling2']);
  });

  it('chains workspace members (one outer root, distinct inner dirs)', () => {
    // Two workspace members + a frontend share one install root: their
    // installs all mutate the root node_modules, so all three sub-scope
    // leaders serialize on one chain even though their directories differ.
    const items: Item[] = [
      { name: 'frontend', outer: 'node:/repo', inner: '/repo/frontend' },
      { name: 'api-a', outer: 'node:/repo', inner: '/repo/services/api-a' },
      { name: 'api-b', outer: 'node:/repo', inner: '/repo/services/api-b' },
      { name: 'py-a', outer: 'python:/repo', inner: '/repo/services/py-a' },
    ];
    const { chains, rest } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['frontend', 'api-a', 'api-b'],
      ['py-a'],
    ]);
    expect(rest).toEqual([]);
  });

  it('keeps custom-install extras on the chain instead of fanning out', () => {
    const items: Item[] = [
      { name: 'a', outer: 'o1', inner: 'shared', custom: true },
      { name: 'b', outer: 'o1', inner: 'shared', custom: true },
      { name: 'c', outer: 'o2', inner: 'own', custom: true },
      { name: 'd', outer: 'o1', inner: 'shared', custom: true },
    ];
    const { chains, rest } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['a', 'b', 'd'],
      ['c'],
    ]);
    expect(rest).toEqual([]);
  });

  it('mixes leaders, custom extras, and default siblings correctly', () => {
    const items: Item[] = [
      { name: 'lead-default', outer: 'o1', inner: 'i-default' },
      { name: 'lead-custom', outer: 'o1', inner: 'i-custom', custom: true },
      { name: 'sib-default', outer: 'o1', inner: 'i-default' },
      { name: 'sib-custom', outer: 'o1', inner: 'i-custom', custom: true },
    ];
    const { chains, rest } = groupIntoScopeChains(items, scopeOf);
    expect(chains.map(c => c.map(i => i.name))).toEqual([
      ['lead-default', 'lead-custom', 'sib-custom'],
    ]);
    expect(rest.map(i => i.name)).toEqual(['sib-default']);
  });
});

describe('resolveInstallScopeRoot()', () => {
  it('resolves a workspace member to the workspace root (node)', async () => {
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
    // Both members resolve to the SAME root: their installs mutate the
    // shared root node_modules and must serialize.
    expect(a).toBe(repo);
    expect(b).toBe(repo);
  });

  it('resolves a standalone service (own lockfile) to its own directory', async () => {
    const repo = await getWriteableDirectory();
    await fs.outputFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n');
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

  it('resolves a `workspaces` package.json root without a lockfile', async () => {
    const repo = await getWriteableDirectory();
    await fs.outputJSON(join(repo, 'package.json'), {
      workspaces: ['services/*'],
    });
    await fs.outputJSON(join(repo, 'services/api/package.json'), {});

    expect(
      await resolveInstallScopeRoot({
        toolchain: 'node',
        serviceDir: join(repo, 'services/api'),
        ceilingDir: repo,
      })
    ).toBe(repo);
  });

  it('resolves uv workspace members to the workspace root (python)', async () => {
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
    // The caller prefixes the toolchain into the outer key; this test pins the
    // resolver halves: same repo, one node root and one python root.
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

  it('falls back to the service directory when nothing is found', async () => {
    const repo = await getWriteableDirectory();
    const dir = join(repo, 'services/loner');
    await fs.ensureDir(dir);

    expect(
      await resolveInstallScopeRoot({
        toolchain: 'node',
        serviceDir: dir,
        ceilingDir: repo,
      })
    ).toBe(dir);
    expect(
      await resolveInstallScopeRoot({
        toolchain: 'python',
        serviceDir: dir,
        ceilingDir: repo,
      })
    ).toBe(dir);
  });

  it('never walks above the ceiling directory', async () => {
    const repo = await getWriteableDirectory();
    // Workspace marker ABOVE the ceiling must not be picked up.
    await fs.outputFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n');
    const ceiling = join(repo, 'project');
    const dir = join(ceiling, 'services/api');
    await fs.ensureDir(dir);

    expect(
      await resolveInstallScopeRoot({
        toolchain: 'node',
        serviceDir: dir,
        ceilingDir: ceiling,
      })
    ).toBe(dir);
  });
});

describe('mergeWorkerMeta()', () => {
  it('unions Set values instead of replacing them', () => {
    const target = { runNpmInstallSet: new Set(['/a']) };
    mergeWorkerMeta(target, { runNpmInstallSet: new Set(['/b']) });
    mergeWorkerMeta(target, { runNpmInstallSet: new Set(['/c', '/a']) });
    expect(Array.from(target.runNpmInstallSet).sort()).toEqual([
      '/a',
      '/b',
      '/c',
    ]);
  });

  it('is commutative for concurrent workers (no lost updates)', () => {
    // Two workers forked from the same snapshot each return their own clone;
    // merging in either order must produce the union.
    const mergeBoth = (first: Set<string>, second: Set<string>) => {
      const target: { runNpmInstallSet?: Set<string> } = {};
      mergeWorkerMeta(target, { runNpmInstallSet: first });
      mergeWorkerMeta(target, { runNpmInstallSet: second });
      return Array.from(target.runNpmInstallSet ?? []).sort();
    };
    const a = new Set(['/x']);
    const b = new Set(['/y']);
    expect(mergeBoth(a, b)).toEqual(mergeBoth(b, a));
    expect(mergeBoth(a, b)).toEqual(['/x', '/y']);
  });

  it('keeps a true latch sticky against a stale false from a slower worker', () => {
    const target = { compiledToCommonJS: true };
    mergeWorkerMeta(target, { compiledToCommonJS: false });
    expect(target.compiledToCommonJS).toBe(true);
  });

  it('sets a latch that a worker turned on', () => {
    const target: { compiledToCommonJS?: boolean } = {};
    mergeWorkerMeta(target, { compiledToCommonJS: true });
    expect(target.compiledToCommonJS).toBe(true);
  });

  it('last-write-wins for plain scalar keys', () => {
    const target = { requestPath: 'old' };
    mergeWorkerMeta(target, { requestPath: 'new' });
    expect(target.requestPath).toBe('new');
  });
});
