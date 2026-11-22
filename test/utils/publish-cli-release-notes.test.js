import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import {
  main,
  parseReleaseNotes,
  readPublishIntegrity,
  PUBLISH_INTEGRITY_ENV,
  fetchNpmPackument,
  npmIntegrityEntries,
  planIntegrityBackfill,
  tryParseReleaseNotes,
} from '../../utils/publish-cli-release-notes.mjs';

vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }));
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal();
  return { ...fs, readFile: vi.fn(fs.readFile) };
});

const changelog = `# vercel

## 2.0.0

### Major Changes

- abcdef1: Remove the legacy command.

### Minor Changes

- abcdef2: Add the new command.
  This includes additional behavior.

### Patch Changes

- abcdef3: Fix the existing command.
- Updated dependencies [abcdef4]
  - @vercel/example@1.0.0

## 1.0.0

### Patch Changes

- abcdef5: Previous release.
`;

describe('parseReleaseNotes', () => {
  it('groups direct changes and excludes dependency updates', () => {
    expect(parseReleaseNotes(changelog, '2.0.0')).toEqual({
      major: [
        {
          commit: 'abcdef1',
          description: 'Remove the legacy command.',
        },
      ],
      minor: [
        {
          commit: 'abcdef2',
          description:
            'Add the new command. This includes additional behavior.',
        },
      ],
      patch: [
        {
          commit: 'abcdef3',
          description: 'Fix the existing command.',
        },
      ],
    });
  });

  it('throws when the release is missing from the changelog', () => {
    expect(() => parseReleaseNotes(changelog, '3.0.0')).toThrow(
      'Could not find vercel@3.0.0 in the CLI changelog'
    );
  });
});

describe('readPublishIntegrity', () => {
  const sample =
    'sha512-txB2MtU8QLYFDT6eCDn26nCPik5COyrusuLktqLnU5fDWM/VWTrjrxM8pa5vavfYOLqA6A8+JScRuw3eNXY5gw==';

  it('prefers the integrity env var from the publish step', async () => {
    await expect(
      readPublishIntegrity({
        env: { [PUBLISH_INTEGRITY_ENV]: sample },
        filePath: join(tmpdir(), 'missing-integrity-file'),
      })
    ).resolves.toBe(sample);
  });

  it('falls back to the integrity file written by npm-publish.sh', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cli-integrity-'));
    const filePath = join(dir, '.vercel-cli-publish-integrity');
    await writeFile(filePath, `${sample}\n`);

    try {
      await expect(
        readPublishIntegrity({
          env: {},
          filePath,
        })
      ).resolves.toBe(sample);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when neither env nor file is present', async () => {
    await expect(
      readPublishIntegrity({
        env: {},
        filePath: join(tmpdir(), 'definitely-missing-integrity'),
      })
    ).rejects.toThrow('Missing vercel publish integrity');
  });
});

const sampleIntegrity =
  'sha512-txB2MtU8QLYFDT6eCDn26nCPik5COyrusuLktqLnU5fDWM/VWTrjrxM8pa5vavfYOLqA6A8+JScRuw3eNXY5gw==';
const otherIntegrity =
  'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

describe('publish CLI release notes', () => {
  const packageJsonPath = fileURLToPath(
    new URL('../../packages/cli/package.json', import.meta.url)
  );
  const checkoutChangelogPath = fileURLToPath(
    new URL('../../packages/cli/CHANGELOG.md', import.meta.url)
  );
  const savedChangelogPath = join(
    tmpdir(),
    'saved candidate',
    'cli-changelog.md'
  );
  const releaseSha = 'a'.repeat(40);
  const savedChangelog = changelog.replace(
    'Fix the existing command.',
    'Saved candidate change, not the main checkout.'
  );
  let env;
  let sql;
  let log;
  let network;

  beforeEach(() => {
    env = {
      CLI_RELEASE_NOTES_DATABASE_URL:
        'postgresql://unused.invalid/release-notes',
      VERCEL_CLI_RELEASE_VERSION: '2.0.0',
      VERCEL_CLI_RELEASE_CHANGELOG: savedChangelogPath,
      VERCEL_CLI_RELEASE_SHA: releaseSha,
      VERCEL_CLI_PUBLISH_INTEGRITY: sampleIntegrity,
      GITHUB_SHA: 'b'.repeat(40),
    };
    vi.mocked(readFile).mockReset();
    vi.mocked(readFile).mockImplementation(async (path, encoding) => {
      expect(encoding).toBe('utf8');
      if (path === packageJsonPath) return JSON.stringify({ version: '1.0.0' });
      if (path === checkoutChangelogPath) return changelog;
      if (path === savedChangelogPath) return savedChangelog;
      throw Object.assign(new Error(`Missing file: ${path}`), {
        code: 'ENOENT',
      });
    });
    sql = vi.fn().mockResolvedValue([]);
    vi.mocked(neon).mockReturnValue(sql);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    network = vi.fn(() => {
      throw new Error('Unexpected network request');
    });
    vi.stubGlobal('fetch', network);
  });

  afterEach(() => {
    expect(network).not.toHaveBeenCalled();
    vi.mocked(readFile).mockReset();
    vi.mocked(neon).mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('publishes saved candidate data without reading checkout metadata', async () => {
    await main({ env });

    expect(readFile.mock.calls).toEqual([[savedChangelogPath, 'utf8']]);
    expect(neon).toHaveBeenCalledWith(env.CLI_RELEASE_NOTES_DATABASE_URL);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0].slice(1)).toEqual([
      'vercel',
      '2.0.0',
      JSON.stringify(parseReleaseNotes(savedChangelog, '2.0.0')),
      sampleIntegrity,
    ]);
    expect(log).toHaveBeenCalledWith(
      `Published CLI release notes for vercel@2.0.0 (${sampleIntegrity}) at ${releaseSha}`
    );
  });

  it('reads the inputs from process.env for the script entrypoint', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    await main();
    expect(sql.mock.calls[0][2]).toBe('2.0.0');
    expect(readFile.mock.calls).toEqual([[savedChangelogPath, 'utf8']]);
  });

  it('keeps the existing upsert on retries', async () => {
    await main({ env });
    await main({ env });

    expect(sql).toHaveBeenCalledTimes(2);
    expect(sql.mock.calls[1]).toEqual(sql.mock.calls[0]);
    expect(sql.mock.calls[0][0].join('?')).toMatch(
      /ON CONFLICT \(package_name, version\)\s+DO UPDATE SET\s+changes = EXCLUDED\.changes,\s+integrity = EXCLUDED\.integrity/
    );
  });

  it('preserves checkout defaults and the existing log when inputs are absent', async () => {
    delete env.VERCEL_CLI_RELEASE_VERSION;
    delete env.VERCEL_CLI_RELEASE_CHANGELOG;
    delete env.VERCEL_CLI_RELEASE_SHA;
    await main({ env });

    expect(readFile.mock.calls).toEqual([
      [packageJsonPath, 'utf8'],
      [checkoutChangelogPath, 'utf8'],
    ]);
    expect(sql.mock.calls[0].slice(1)).toEqual([
      'vercel',
      '1.0.0',
      JSON.stringify(parseReleaseNotes(changelog, '1.0.0')),
      sampleIntegrity,
    ]);
    expect(log).toHaveBeenCalledWith(
      `Published CLI release notes for vercel@1.0.0 (${sampleIntegrity})`
    );
  });

  it('allows a version override with the default changelog', async () => {
    delete env.VERCEL_CLI_RELEASE_CHANGELOG;
    await main({ env });
    expect(readFile.mock.calls).toEqual([[checkoutChangelogPath, 'utf8']]);
    expect(sql.mock.calls[0][3]).toBe(
      JSON.stringify(parseReleaseNotes(changelog, '2.0.0'))
    );
  });

  it('allows a changelog override with the default version', async () => {
    delete env.VERCEL_CLI_RELEASE_VERSION;
    await main({ env });
    expect(readFile.mock.calls).toEqual([
      [packageJsonPath, 'utf8'],
      [savedChangelogPath, 'utf8'],
    ]);
    expect(sql.mock.calls[0][2]).toBe('1.0.0');
    expect(sql.mock.calls[0][3]).toBe(
      JSON.stringify(parseReleaseNotes(savedChangelog, '1.0.0'))
    );
  });

  it('fails rather than falling back when the saved changelog is missing', async () => {
    env.VERCEL_CLI_RELEASE_CHANGELOG = join(
      tmpdir(),
      'missing-cli-changelog.md'
    );
    await expect(main({ env })).rejects.toMatchObject({ code: 'ENOENT' });
    expect(readFile.mock.calls).toEqual([
      [env.VERCEL_CLI_RELEASE_CHANGELOG, 'utf8'],
    ]);
    expect(neon).not.toHaveBeenCalled();
  });

  it('fails rather than substituting the checkout version for a missing release', async () => {
    env.VERCEL_CLI_RELEASE_VERSION = '3.0.0';
    await expect(main({ env })).rejects.toThrow(
      'Could not find vercel@3.0.0 in the CLI changelog'
    );
    expect(neon).not.toHaveBeenCalled();
  });

  it('still rejects dependency-only notes before connecting to the database', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '## 2.0.0\n\n### Patch Changes\n\n- Updated dependencies [abcdef4]\n  - @vercel/example@1.0.0\n'
    );
    await expect(main({ env })).rejects.toThrow(
      'No direct changes found for vercel@2.0.0'
    );
    expect(neon).not.toHaveBeenCalled();
  });

  it('still requires publish-time integrity before connecting to the database', async () => {
    env.VERCEL_CLI_PUBLISH_INTEGRITY = 'sha1-not-publish-integrity';
    await expect(main({ env })).rejects.toThrow(
      'Missing vercel publish integrity'
    );
    expect(neon).not.toHaveBeenCalled();
  });

  it('still requires database configuration before reading inputs', async () => {
    delete env.CLI_RELEASE_NOTES_DATABASE_URL;
    await expect(main({ env })).rejects.toThrow(
      'CLI_RELEASE_NOTES_DATABASE_URL is required'
    );
    expect(readFile).not.toHaveBeenCalled();
    expect(neon).not.toHaveBeenCalled();
  });

  it('propagates database failures without logging success', async () => {
    sql.mockRejectedValue(new Error('mock database failure'));
    await expect(main({ env })).rejects.toThrow('mock database failure');
    expect(log).not.toHaveBeenCalled();
  });
});

describe('fetchNpmPackument', () => {
  it('throws when npm returns a non-OK status', async () => {
    await expect(
      fetchNpmPackument('vercel', {
        fetchImpl: async () => ({ ok: false, status: 500 }),
      })
    ).rejects.toThrow('Failed to fetch vercel packument from npm (500)');
  });
});

describe('npmIntegrityEntries', () => {
  it('keeps sha512 integrities and drops versions without them', () => {
    expect(
      npmIntegrityEntries({
        versions: {
          '1.0.0': { dist: { integrity: `${sampleIntegrity} ` } },
          '1.0.1': { dist: { integrity: 'sha1-not-used' } },
          '1.0.2': { dist: {} },
        },
        time: { '1.0.0': '2026-01-01T00:00:00.000Z' },
      })
    ).toEqual([
      {
        version: '1.0.0',
        integrity: sampleIntegrity,
        publishedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('tryParseReleaseNotes', () => {
  it('returns empty changes when the version is missing', () => {
    expect(tryParseReleaseNotes(changelog, '9.9.9')).toEqual({});
  });
});

describe('planIntegrityBackfill', () => {
  const npmEntries = [
    {
      version: '2.0.0',
      integrity: sampleIntegrity,
      publishedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      version: '1.0.0',
      integrity: otherIntegrity,
      publishedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      version: '0.9.0',
      integrity: sampleIntegrity,
      publishedAt: '2025-12-01T00:00:00.000Z',
    },
  ];

  it('updates rows that exist without integrity', () => {
    const plan = planIntegrityBackfill({
      npmEntries,
      existingRows: [{ version: '2.0.0', integrity: null }],
      changelog,
    });

    expect(plan.updates).toEqual([
      { version: '2.0.0', integrity: sampleIntegrity },
    ]);
  });

  it('does not overwrite first-party sha512 integrity', () => {
    const plan = planIntegrityBackfill({
      npmEntries,
      existingRows: [{ version: '2.0.0', integrity: otherIntegrity }],
      changelog,
    });

    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ version: '2.0.0', reason: 'already-set' }]);
  });

  it('inserts missing versions with changelog notes when they parse', () => {
    const plan = planIntegrityBackfill({
      npmEntries,
      existingRows: [],
      changelog,
    });

    expect(plan.inserts).toEqual(
      expect.arrayContaining([
        {
          version: '2.0.0',
          integrity: sampleIntegrity,
          publishedAt: '2026-02-01T00:00:00.000Z',
          changes: parseReleaseNotes(changelog, '2.0.0'),
        },
        {
          version: '0.9.0',
          integrity: sampleIntegrity,
          publishedAt: '2025-12-01T00:00:00.000Z',
          changes: {},
        },
      ])
    );
  });

  it('skips inserting prereleases that have no changelog notes', () => {
    const plan = planIntegrityBackfill({
      npmEntries: [
        {
          version: '2.0.0-canary.1',
          integrity: sampleIntegrity,
          publishedAt: '2026-02-02T00:00:00.000Z',
        },
      ],
      existingRows: [],
      changelog,
    });

    expect(plan.inserts).toEqual([]);
    expect(plan.skipped).toEqual([
      { version: '2.0.0-canary.1', reason: 'prerelease' },
    ]);
  });
});
