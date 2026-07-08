import { join } from 'path';
import { promises, existsSync } from 'fs';
import { tmpdir } from 'os';
import {
  frameworksManifest,
  partitionManifest,
  resolveFrameworkList,
  type FrameworkManifestEntry,
} from '../src/frameworks';

const { mkdtemp, readFile, rm, writeFile } = promises;

describe('pinned manifest', () => {
  it('exists (fetched by build.mjs, not checked into git)', () => {
    expect(existsSync(join(__dirname, '..', 'src', 'frameworks.json'))).toBe(
      true
    );
  });

  it('is a non-empty, fully interpretable framework list', () => {
    expect(frameworksManifest.length).toBeGreaterThan(0);
    const { frameworks, requiresUpdate } =
      partitionManifest(frameworksManifest);
    expect(requiresUpdate).toEqual([]);
    expect(frameworks.length).toBe(frameworksManifest.length);
  });
});

function entry(
  overrides: Partial<FrameworkManifestEntry> & { slug: string }
): FrameworkManifestEntry {
  return {
    name: overrides.slug,
    logo: `https://api-frameworks.vercel.sh/framework-logos/${overrides.slug}.svg`,
    description: `The ${overrides.slug} framework`,
    settings: {
      installCommand: { placeholder: 'None' },
      buildCommand: { placeholder: 'None', value: null },
      devCommand: { placeholder: 'None', value: null },
      outputDirectory: { placeholder: 'None' },
    },
    outputDirName: { type: 'static', value: 'public' },
    ...overrides,
  } as FrameworkManifestEntry;
}

describe('partitionManifest', () => {
  it('interprets static outputDirName descriptors', async () => {
    const { frameworks, requiresUpdate } = partitionManifest([
      entry({ slug: 'a', outputDirName: { type: 'static', value: 'dist' } }),
    ]);
    expect(requiresUpdate).toEqual([]);
    expect(frameworks).toHaveLength(1);
    await expect(frameworks[0].getOutputDirName('unused')).resolves.toBe(
      'dist'
    );
  });

  it('reports entries with unsupported descriptors instead of throwing', () => {
    const { frameworks, requiresUpdate } = partitionManifest([
      entry({ slug: 'ok' }),
      entry({
        slug: 'future',
        outputDirName: { type: 'from-the-future' },
      }),
    ]);
    expect(frameworks.map(f => f.slug)).toEqual(['ok']);
    expect(requiresUpdate).toHaveLength(1);
    expect(requiresUpdate[0].entry.slug).toBe('future');
    expect(requiresUpdate[0].reason).toBe('unsupported-entry');
  });

  it('enforces minCliVersion when a cliVersion is provided', () => {
    const manifest = [
      entry({ slug: 'old' }),
      entry({ slug: 'new', minCliVersion: '99.0.0' }),
      entry({ slug: 'current', minCliVersion: '1.0.0' }),
    ];

    const { frameworks, requiresUpdate } = partitionManifest(manifest, {
      cliVersion: '54.0.0',
    });
    expect(frameworks.map(f => f.slug)).toEqual(['old', 'current']);
    expect(requiresUpdate.map(s => s.entry.slug)).toEqual(['new']);
    expect(requiresUpdate[0].reason).toBe('min-cli-version');
  });

  it('does not enforce minCliVersion when cliVersion is omitted', () => {
    const { frameworks, requiresUpdate } = partitionManifest([
      entry({ slug: 'new', minCliVersion: '99.0.0' }),
    ]);
    expect(frameworks.map(f => f.slug)).toEqual(['new']);
    expect(requiresUpdate).toEqual([]);
  });

  it('treats version-gated entries as stale for non-semver CLI versions', () => {
    const { frameworks, requiresUpdate } = partitionManifest(
      [entry({ slug: 'old' }), entry({ slug: 'new', minCliVersion: '1.0.0' })],
      { cliVersion: 'snapshot-abc123' }
    );
    expect(frameworks.map(f => f.slug)).toEqual(['old']);
    expect(requiresUpdate.map(s => s.entry.slug)).toEqual(['new']);
  });

  it('treats entries with a malformed minCliVersion as stale instead of throwing', () => {
    const { frameworks, requiresUpdate } = partitionManifest(
      [
        entry({ slug: 'old' }),
        entry({ slug: 'bad', minCliVersion: 'not-a-version' }),
      ],
      { cliVersion: '54.0.0' }
    );
    expect(frameworks.map(f => f.slug)).toEqual(['old']);
    expect(requiresUpdate.map(s => s.entry.slug)).toEqual(['bad']);
    expect(requiresUpdate[0].reason).toBe('min-cli-version');
  });

  it('preserves failOnStale on stale entries', () => {
    const { requiresUpdate } = partitionManifest(
      [
        entry({
          slug: 'container-like',
          minCliVersion: '99.0.0',
          failOnStale: true,
        }),
      ],
      { cliVersion: '54.0.0' }
    );
    expect(requiresUpdate[0].entry.failOnStale).toBe(true);
  });

  it('applies runtime overrides over manifest descriptors', async () => {
    const { frameworks } = partitionManifest([entry({ slug: 'special' })], {
      overrides: {
        special: { getOutputDirName: async () => 'overridden' },
      },
    });
    await expect(frameworks[0].getOutputDirName('unused')).resolves.toBe(
      'overridden'
    );
  });

  it('strips manifest-only fields from interpreted frameworks', () => {
    const { frameworks } = partitionManifest([
      entry({ slug: 'a', minCliVersion: '1.0.0', failOnStale: true }),
    ]);
    expect(frameworks[0]).not.toHaveProperty('outputDirName');
    expect(frameworks[0]).not.toHaveProperty('minCliVersion');
    expect(frameworks[0]).not.toHaveProperty('failOnStale');
  });
});

describe('resolveFrameworkList', () => {
  let cacheDir: string;
  const pinnedManifest = [entry({ slug: 'pinned' })];

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'vc-frameworks-test-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    delete process.env.VERCEL_SKIP_REMOTE_FRAMEWORKS;
    vi.unstubAllGlobals();
  });

  function stubFetch(
    handler: () => Promise<Response> | Response
  ): ReturnType<typeof vi.fn> {
    const mock = vi.fn(handler);
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('uses the remote manifest and writes the cache', async () => {
    const fetchMock = stubFetch(() =>
      Response.json([entry({ slug: 'remote' })])
    );

    const result = await resolveFrameworkList({ cacheDir, pinnedManifest });
    expect(result.source).toBe('remote');
    expect(result.frameworks.map(f => f.slug)).toEqual(['remote']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cached = JSON.parse(
      await readFile(join(cacheDir, 'frameworks-manifest.json'), 'utf8')
    );
    expect(cached.manifest[0].slug).toBe('remote');
  });

  it('uses a fresh cache without fetching', async () => {
    const fetchMock = stubFetch(() => {
      throw new Error('should not fetch');
    });
    await writeFile(
      join(cacheDir, 'frameworks-manifest.json'),
      JSON.stringify({
        fetchedAt: Date.now(),
        manifest: [entry({ slug: 'cached' })],
      })
    );

    const result = await resolveFrameworkList({ cacheDir, pinnedManifest });
    expect(result.source).toBe('cache');
    expect(result.frameworks.map(f => f.slug)).toEqual(['cached']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refetches when the cache is older than the TTL', async () => {
    stubFetch(() => Response.json([entry({ slug: 'remote' })]));
    await writeFile(
      join(cacheDir, 'frameworks-manifest.json'),
      JSON.stringify({
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        manifest: [entry({ slug: 'cached' })],
      })
    );

    const result = await resolveFrameworkList({ cacheDir, pinnedManifest });
    expect(result.source).toBe('remote');
    expect(result.frameworks.map(f => f.slug)).toEqual(['remote']);
  });

  it('falls back to a stale cache when the fetch fails', async () => {
    stubFetch(() => {
      throw new Error('network down');
    });
    await writeFile(
      join(cacheDir, 'frameworks-manifest.json'),
      JSON.stringify({
        fetchedAt: 0,
        manifest: [entry({ slug: 'stale-cached' })],
      })
    );

    const result = await resolveFrameworkList({ cacheDir, pinnedManifest });
    expect(result.source).toBe('cache');
    expect(result.frameworks.map(f => f.slug)).toEqual(['stale-cached']);
  });

  it('falls back to the pinned manifest when fetch fails and no cache exists', async () => {
    stubFetch(() => {
      throw new Error('network down');
    });

    const result = await resolveFrameworkList({ cacheDir, pinnedManifest });
    expect(result.source).toBe('pinned');
    expect(result.frameworks.map(f => f.slug)).toEqual(['pinned']);
  });

  it('falls back to the pinned manifest on malformed responses', async () => {
    stubFetch(() => Response.json({ not: 'an array' }));

    const result = await resolveFrameworkList({ cacheDir, pinnedManifest });
    expect(result.source).toBe('pinned');
  });

  it('uses the pinned manifest when skipRemote is set', async () => {
    const fetchMock = stubFetch(() =>
      Response.json([entry({ slug: 'remote' })])
    );

    const result = await resolveFrameworkList({
      cacheDir,
      pinnedManifest,
      skipRemote: true,
    });
    expect(result.source).toBe('pinned');
    expect(result.frameworks.map(f => f.slug)).toEqual(['pinned']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the pinned manifest when VERCEL_SKIP_REMOTE_FRAMEWORKS is set', async () => {
    const fetchMock = stubFetch(() =>
      Response.json([entry({ slug: 'remote' })])
    );
    process.env.VERCEL_SKIP_REMOTE_FRAMEWORKS = '1';

    const result = await resolveFrameworkList({ cacheDir, pinnedManifest });
    expect(result.source).toBe('pinned');
    expect(result.frameworks.map(f => f.slug)).toEqual(['pinned']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('partitions the remote manifest against the provided cliVersion', async () => {
    stubFetch(() =>
      Response.json([
        entry({ slug: 'usable' }),
        entry({ slug: 'too-new', minCliVersion: '99.0.0', failOnStale: true }),
      ])
    );

    const result = await resolveFrameworkList({
      cacheDir,
      pinnedManifest,
      cliVersion: '54.0.0',
    });
    expect(result.frameworks.map(f => f.slug)).toEqual(['usable']);
    expect(result.requiresUpdate.map(s => s.entry.slug)).toEqual(['too-new']);
    expect(result.requiresUpdate[0].entry.failOnStale).toBe(true);
  });
});
