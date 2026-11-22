import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  DEPS_INSTALL_SCRIPT,
  DEPS_SNAPSHOT_FORMAT,
  depsSnapshotKey,
  installInputPaths,
  localBuildMode,
  pnpmVersion,
  syncPaths,
  workspaceRuntimeDeps,
} from '../../../../../scripts/testserver/modes/local-build.mjs';
import { makeRunnerRepo } from '../fixture';

describe('depsSnapshotKey()', () => {
  const files = [
    { path: 'package.json', content: Buffer.from('{"a":1}') },
    { path: 'pnpm-lock.yaml', content: Buffer.from('lock') },
  ];
  const base = { files, pnpmVersion: '10.29.3', format: 1 };

  test('matches the pinned key, so a change to it is deliberate', () => {
    expect(depsSnapshotKey(base)).toBe(
      '5fc3ed51f57feeba0d9c135fb755d7c9bb2ef1836be1aff81e90a27b2c84fee7'
    );
  });

  test('changes with the install script', () => {
    const key = depsSnapshotKey(base);
    expect(depsSnapshotKey({ ...base, recipe: DEPS_INSTALL_SCRIPT })).toBe(key);
    expect(
      depsSnapshotKey({
        ...base,
        recipe: DEPS_INSTALL_SCRIPT.replace('--frozen-lockfile', ''),
      })
    ).not.toBe(key);
  });

  test('uses a recipe format past the staged-upload recipe change', () => {
    expect(DEPS_SNAPSHOT_FORMAT).toBeGreaterThanOrEqual(2);
  });

  test('ignores file order', () => {
    expect(depsSnapshotKey(base)).toBe(
      depsSnapshotKey({ ...base, files: [...files].reverse() })
    );
  });

  test('changes with content, pnpm version or format', () => {
    const key = depsSnapshotKey(base);
    expect(
      depsSnapshotKey({
        ...base,
        files: [files[0], { ...files[1], content: Buffer.from('lock2') }],
      })
    ).not.toBe(key);
    expect(depsSnapshotKey({ ...base, pnpmVersion: '10.30.0' })).not.toBe(key);
    expect(depsSnapshotKey({ ...base, format: 2 })).not.toBe(key);
  });

  test('does not confuse a path with content', () => {
    expect(
      depsSnapshotKey({
        ...base,
        files: [{ path: 'a', content: Buffer.from('bc') }],
      })
    ).not.toBe(
      depsSnapshotKey({
        ...base,
        files: [{ path: 'ab', content: Buffer.from('c') }],
      })
    );
  });
});

describe('workspace fixtures', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeRepo() {
    root = makeRunnerRepo();
  }

  test('installInputPaths() lists root inputs and workspace manifests', () => {
    makeRepo();
    expect(installInputPaths(root)).toEqual([
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      'api/package.json',
      'packages/auth/package.json',
      'packages/builder/package.json',
      'packages/cli/package.json',
      'packages/client/package.json',
      'packages/utils/package.json',
    ]);
  });
  test('installInputPaths() normalizes included and excluded workspace manifest paths', () => {
    makeRepo();
    const expected = installInputPaths(root).filter(
      path => path !== 'packages/builder/package.json'
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - './packages/*'\n  - './api'\n  - '!./packages/builder'\n"
    );
    expect(installInputPaths(root)).toEqual(expected);
  });

  test('pnpmVersion() reads the root packageManager', () => {
    makeRepo();
    expect(pnpmVersion(root)).toBe('10.29.3');
  });

  test('workspaceRuntimeDeps() follows workspace dependencies only', () => {
    makeRepo();
    const deps = workspaceRuntimeDeps(join(root, 'packages/cli'), root);
    expect(deps).toEqual([
      {
        name: '@vercel/auth',
        dir: 'packages/auth',
        include: [
          'packages/auth/package.json',
          'packages/auth/oauth.js',
          'packages/auth/oauth.ts',
        ],
      },
      {
        name: '@vercel/builder',
        dir: 'packages/builder',
        // `bin` doesn't exist, and the negation is ignored.
        include: [
          'packages/builder/package.json',
          'packages/builder/dist',
          'packages/builder/edge-entry.js',
        ],
      },
      {
        name: '@vercel/utils',
        dir: 'packages/utils',
        include: ['packages/utils/package.json', 'packages/utils/dist'],
      },
    ]);
  });

  test('syncPaths() lists the lane files and runtime deps', () => {
    makeRepo();
    expect(syncPaths(root)).toEqual([
      'packages/auth/oauth.js',
      'packages/auth/oauth.ts',
      'packages/auth/package.json',
      'packages/builder/dist/index.js',
      'packages/builder/edge-entry.js',
      'packages/builder/package.json',
      'packages/cli/dist/index.js',
      'packages/cli/dist/version.mjs',
      'packages/cli/package.json',
      'packages/cli/scripts/start.js',
      'packages/cli/src/index.ts',
      'packages/cli/test/helpers/get-cli-path.ts',
      'packages/cli/test/helpers/setup-unit-fixture.ts',
      'packages/cli/test/testserver/commands/whoami/whoami.test.ts',
      'packages/cli/vitest.testserver.config.mts',
      'packages/utils/dist/index.js',
      'packages/utils/package.json',
    ]);
  });
});

interface Written {
  path: string;
  content: Buffer;
}

/** The staging directory the fake sandbox's `mktemp -d` makes. */
const STAGING = '/tmp/testserver.test';

/**
 * Records the files written and the commands run; every command exits 0.
 * `mktemp` prints STAGING and isn't recorded.
 */
function fakeSandbox() {
  const written: Written[] = [];
  const commands: { cmd: string; args?: string[] }[] = [];
  return {
    written,
    commands,
    async writeFiles(files: Written[]) {
      written.push(...files);
    },
    async runCommand(params: { cmd: string; args?: string[] }) {
      if (params.cmd === 'mktemp') {
        return { exitCode: 0, stdout: async () => `${STAGING}\n` };
      }
      commands.push(params);
      return { exitCode: 0, output: async () => '' };
    },
  };
}

describe('localBuildMode()', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('keys its snapshot on the install inputs', () => {
    root = makeRunnerRepo();
    const mode = localBuildMode({ repoRoot: root });
    const files = installInputPaths(root).map((path: string) => ({
      path,
      content: readFileSync(join(root, path)),
    }));
    expect(mode.snapshot.key).toBe(
      depsSnapshotKey({
        files,
        pnpmVersion: '10.29.3',
        format: DEPS_SNAPSHOT_FORMAT,
      })
    );
    expect(mode.snapshot).toMatchObject({
      vcpus: 4,
      builtFor: 'this lockfile',
      entry: {},
    });
    expect(mode.snapshot.missMessage).toContain('pnpm 10.29.3 install');
    expect(mode.summary).toBe('against the CLI built on this machine');
    expect(mode.startedNote).toBe('');
    // Sized for the tests alone: no build runs in the runner.
    expect(mode.vcpus(1)).toBe(2);
    expect(mode.vcpus(8)).toBe(16);
  });

  test('its snapshot recipe uploads the install inputs, then installs', async () => {
    root = makeRunnerRepo();
    const mode = localBuildMode({ repoRoot: root });
    const logs: string[] = [];
    const recipe = mode.snapshot.begin({
      log: (line: string) => logs.push(line),
      prefix: '[runner snapshot]',
    });
    const sandbox = fakeSandbox();
    const steps: [string, string][] = [];
    await recipe(sandbox, async (label: string, script: string) => {
      steps.push([label, script]);
    });

    expect(sandbox.written.map(f => f.path)).toEqual([
      `${STAGING}/install-inputs.tgz`,
    ]);
    expect(sandbox.written[0].content.length).toBeGreaterThan(0);
    expect(sandbox.commands[0]).toMatchObject({
      cmd: 'tar',
      args: [
        '--warning=no-unknown-keyword',
        '-xzf',
        `${STAGING}/install-inputs.tgz`,
        '-C',
        '/vercel/sandbox',
      ],
    });
    expect(logs).toEqual([
      '[runner snapshot] ✓ Uploaded the install inputs (10 files)',
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0][0]).toBe('pnpm install');
    expect(steps[0][1]).toContain(
      'corepack pnpm install --frozen-lockfile --filter vercel...'
    );
  });

  test('uploads and extracts the files this machine built', async () => {
    root = makeRunnerRepo();
    const mode = localBuildMode({ repoRoot: root });
    const files = syncPaths(root).length;

    const sandbox = fakeSandbox();
    const phases: string[] = [];
    const logs: string[] = [];
    await mode.apply(sandbox, {
      phases,
      log: (line: string) => logs.push(line),
    });

    expect(sandbox.written).toEqual([
      { path: `${STAGING}/sync.tgz`, content: expect.any(Buffer) },
    ]);
    expect(sandbox.written[0].content.length).toBeGreaterThan(0);
    expect(sandbox.commands[0]).toMatchObject({
      cmd: 'tar',
      args: expect.arrayContaining([`${STAGING}/sync.tgz`]),
    });
    expect(phases).toEqual([
      expect.stringMatching(/^upload \d+\.\d MB \d+\.\ds$/),
    ]);
    expect(logs).toEqual([
      expect.stringMatching(
        new RegExp(`^✓ \\[runner\\] Uploaded ${files} files `)
      ),
    ]);
  });

  test('is ready once its upload is packed', async () => {
    root = makeRunnerRepo();
    await expect(
      localBuildMode({ repoRoot: root }).ready
    ).resolves.toBeUndefined();
  });

  test('rejects `ready` when packing its upload fails', async () => {
    root = makeRunnerRepo();
    // tar is looked up when packing starts, inside the factory.
    const { PATH } = process.env;
    process.env.PATH = join(root, 'no-such-bin');
    let mode;
    try {
      mode = localBuildMode({ repoRoot: root });
    } finally {
      process.env.PATH = PATH;
    }
    await expect(mode.ready).rejects.toThrow(/ENOENT/);
  });

  test('refuses an upload it cannot list before returning', () => {
    root = makeRunnerRepo();
    writeFileSync(
      join(root, 'packages/auth/package.json'),
      JSON.stringify({ name: '@vercel/auth', files: ['lib/*.js'] })
    );
    expect(() => localBuildMode({ repoRoot: root })).toThrow(
      /Unsupported `files` glob `lib\/\*\.js`/
    );
  });
});
