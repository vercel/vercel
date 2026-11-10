import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  expandChangesetReleases,
  expandInternalChangesets,
  internalsBundledBy,
  publicBundlersByInternal,
} from '../../utils/expand-internal-changesets.mjs';

const tempDirs = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))
  );
});

function pkg(name, fields = {}) {
  return { name, ...fields };
}

const workspace = [
  pkg('vercel', {
    devDependencies: {
      '@vercel-internals/cli-builder-integration': 'workspace:*',
    },
  }),
  pkg('@vercel/go', {
    devDependencies: { '@vercel-internals/ipc-proxy': 'workspace:*' },
  }),
  pkg('@vercel/rust', {
    devDependencies: { '@vercel-internals/ipc-proxy': 'workspace:*' },
  }),
  pkg('@vercel-internals/cli-builder-integration', {
    private: true,
    dependencies: { '@vercel-internals/runtimes': 'workspace:*' },
    devDependencies: { '@vercel-internals/tsconfig': 'workspace:*' },
  }),
  pkg('@vercel-internals/runtimes', { private: true }),
  pkg('@vercel-internals/ipc-proxy', { private: true }),
  pkg('@vercel-internals/tsconfig', { private: true }),
];

describe('internalsBundledBy', () => {
  it('follows internals runtime deps from a public package devDependency', () => {
    const byName = new Map(workspace.map(p => [p.name, p]));
    expect([
      ...internalsBundledBy(
        workspace.find(p => p.name === 'vercel'),
        byName
      ),
    ]).toEqual([
      '@vercel-internals/cli-builder-integration',
      '@vercel-internals/runtimes',
    ]);
  });

  it('does not follow internals that are only devDependencies of other internals', () => {
    const byName = new Map(workspace.map(p => [p.name, p]));
    expect(
      internalsBundledBy(
        workspace.find(p => p.name === 'vercel'),
        byName
      ).has('@vercel-internals/tsconfig')
    ).toBe(false);
  });
});

describe('publicBundlersByInternal', () => {
  it('maps each bundled internal to the public packages that ship it', () => {
    const bundlers = publicBundlersByInternal(workspace);
    expect([...bundlers.get('@vercel-internals/runtimes')]).toEqual(['vercel']);
    expect([...bundlers.get('@vercel-internals/ipc-proxy')].sort()).toEqual([
      '@vercel/go',
      '@vercel/rust',
    ]);
    expect(bundlers.has('@vercel-internals/tsconfig')).toBe(false);
  });
});

describe('expandChangesetReleases', () => {
  const bundlers = publicBundlersByInternal(workspace);

  it('adds public packages that bundle a released internal', () => {
    const { releases, added } = expandChangesetReleases(
      {
        releases: [{ name: '@vercel-internals/runtimes', type: 'patch' }],
        summary: 'Shared helper',
      },
      bundlers
    );
    expect(added).toEqual([
      {
        name: 'vercel',
        type: 'patch',
        because: '@vercel-internals/runtimes',
      },
    ]);
    expect(releases).toEqual(
      expect.arrayContaining([
        { name: '@vercel-internals/runtimes', type: 'patch' },
        { name: 'vercel', type: 'patch' },
      ])
    );
  });

  it('raises an existing public bump when the internal bump is higher', () => {
    const { releases, added, changed } = expandChangesetReleases(
      {
        releases: [
          { name: '@vercel-internals/runtimes', type: 'minor' },
          { name: 'vercel', type: 'patch' },
        ],
        summary: 'Both',
      },
      bundlers
    );
    expect(changed).toBe(true);
    expect(added).toEqual([]);
    expect(releases).toContainEqual({ name: 'vercel', type: 'minor' });
  });

  it('keeps a higher bump already listed for the public package', () => {
    const { releases, added, changed } = expandChangesetReleases(
      {
        releases: [
          { name: '@vercel-internals/runtimes', type: 'patch' },
          { name: 'vercel', type: 'minor' },
        ],
        summary: 'Both',
      },
      bundlers
    );
    expect(changed).toBe(false);
    expect(added).toEqual([]);
    expect(releases).toContainEqual({ name: 'vercel', type: 'minor' });
  });

  it('adds every public package that bundles the same internal', () => {
    const { added } = expandChangesetReleases(
      {
        releases: [{ name: '@vercel-internals/ipc-proxy', type: 'patch' }],
        summary: 'Shared proxy',
      },
      bundlers
    );
    expect(added.map(item => item.name).sort()).toEqual([
      '@vercel/go',
      '@vercel/rust',
    ]);
  });

  it('does not add public packages for unrelated changesets', () => {
    const { added } = expandChangesetReleases(
      {
        releases: [{ name: '@vercel/node', type: 'patch' }],
        summary: 'Node runtime',
      },
      bundlers
    );
    expect(added).toEqual([]);
  });
});

describe('expandInternalChangesets', () => {
  it('rewrites changeset files on disk', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'expand-internal-changesets-'));
    tempDirs.push(cwd);
    await mkdir(join(cwd, '.changeset'), { recursive: true });
    await mkdir(join(cwd, 'packages', 'cli'), { recursive: true });
    await mkdir(join(cwd, 'internals', 'runtimes'), { recursive: true });
    await writeFile(
      join(cwd, 'packages', 'cli', 'package.json'),
      JSON.stringify({
        name: 'vercel',
        devDependencies: {
          '@vercel-internals/runtimes': 'workspace:*',
        },
      })
    );
    await writeFile(
      join(cwd, 'internals', 'runtimes', 'package.json'),
      JSON.stringify({
        name: '@vercel-internals/runtimes',
        private: true,
      })
    );
    const changesetPath = join(cwd, '.changeset', 'cool-cats-dance.md');
    await writeFile(
      changesetPath,
      "---\n'@vercel-internals/runtimes': patch\n---\n\nShared helper.\n"
    );

    const modified = await expandInternalChangesets(cwd);
    expect(modified).toHaveLength(1);
    expect(await readFile(changesetPath, 'utf8')).toContain('"vercel": patch');
  });
});
