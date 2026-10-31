import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applyScript,
  assembleRunPayload,
  BUILD_SCRIPT,
  baseArchive,
  baseIndexScript,
  GO_VERSION,
  basePnpmVersion,
  baseRustToolchain,
  INSTALL_SCRIPT,
  installNeededFor,
  isInstallInputPath,
  parseRustToolchain,
  partitionUntracked,
  recipeText,
  resolveBase,
  runnerBuildMode,
  SNAPSHOT_FORMAT,
  snapshotKey,
  splitNul,
  submodulePaths,
  toolchainScript,
  UNTRACKED_LISTED_MAX,
  untrackedSummary,
  UV_VERSION,
} from '../../../../../scripts/testserver/modes/runner-build.mjs';
import {
  LOCAL_BUILD_HINT,
  LOCAL_HINT,
} from '../../../../../scripts/testserver/runner-config.mjs';

// The developer's global git config (hooks, signing, prefixes) stays out.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** `git -C root <args>` with a test identity; returns stdout. */
function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-C',
      root,
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { encoding: 'utf8', env: GIT_ENV }
  );
}

/** Write `content` to `root/path`, creating its directories. */
function writeRepoFile(root: string, path: string, content = '') {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}

/**
 * A temp git repo shaped like the workspace, for the Testserver runner tests:
 * root install inputs, a few workspace packages, a rust-toolchain.toml and a
 * .gitignore. Everything is committed on `main`, `origin/main` points at
 * the same commit, and HEAD is a `feature` branch off it, so that commit is
 * the merge-base. Returns its root; the caller removes it.
 */
function makeGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'testserver-runner-'));
  const file = (path: string, content = '') =>
    writeRepoFile(root, path, content);
  const pkg = (dir: string, manifest: object) =>
    file(`${dir}/package.json`, JSON.stringify(manifest));

  file('package.json', JSON.stringify({ packageManager: 'pnpm@10.29.3' }));
  file('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  file(
    'pnpm-workspace.yaml',
    "packages:\n  - 'packages/*'\n  - 'api'\n  - 'missing'\n"
  );
  file('.npmrc', 'save-exact=true\n');
  file('.gitignore', 'node_modules\ndist\n.results/\n');
  pkg('api', { name: 'api' });
  pkg('packages/cli', { name: 'vercel' });
  pkg('packages/builder', { name: '@vercel/builder' });
  pkg('packages/utils', { name: '@vercel/utils' });
  file('packages/cli/src/index.ts', 'export const a = 1;\n');
  file('packages/cli/test/testserver/commands/whoami/whoami.test.ts');
  file('packages/builder/src/index.ts', 'export const b = 1;\n');
  file(
    'packages/python-analysis/rust-toolchain.toml',
    '[toolchain]\nchannel = "1.96.1"\ntargets = ["wasm32-wasip2"]\n'
  );

  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--no-verify', '-m', 'base');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  // Later commits are branch work, as in a real checkout.
  git(root, 'checkout', '-q', '-b', 'feature');
  return root;
}

describe('snapshotKey()', () => {
  const base = {
    base: '010a5ffcf6e7f18915afe983b9e0d6f722958860',
    format: 2,
  };

  test('is stable for the same inputs', () => {
    expect(snapshotKey(base)).toBe(snapshotKey({ ...base }));
    expect(snapshotKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('changes with the base or format', () => {
    const key = snapshotKey(base);
    expect(
      snapshotKey({
        ...base,
        base: '0642f9844ef7e0e8a3568916564a791c7de00909',
      })
    ).not.toBe(key);
    expect(snapshotKey({ ...base, format: 3 })).not.toBe(key);
  });

  test('changes with the recipe text', () => {
    const key = snapshotKey(base);
    expect(snapshotKey({ ...base, recipe: recipeText() })).toBe(key);
    expect(
      snapshotKey({
        ...base,
        recipe: recipeText().replace(UV_VERSION, '0.0.1'),
      })
    ).not.toBe(key);
  });

  test('uses a recipe format past the uv 0.13.5 recipe change', () => {
    expect(SNAPSHOT_FORMAT).toBeGreaterThanOrEqual(4);
  });
});

describe('recipeText()', () => {
  test('covers every snapshot script and the uv and Go versions', () => {
    const text = recipeText();
    for (const script of [INSTALL_SCRIPT, BUILD_SCRIPT]) {
      expect(text).toContain(script);
    }
    expect(text).toContain(UV_VERSION);
    expect(text).toContain(GO_VERSION);
    expect(text).toContain('rustup target add');
  });

  test('leaves out what the base and the staging directory decide', () => {
    expect(recipeText()).toContain('<staging>/');
    expect(recipeText()).toContain("'base <base>'");
    expect(recipeText()).toBe(recipeText());
  });
});

describe('parseRustToolchain()', () => {
  test('reads the channel and targets', () => {
    expect(
      parseRustToolchain(
        '[toolchain]\n# pinned\nchannel = "1.96.1"\ntargets = ["wasm32-wasip2", "x"]\n'
      )
    ).toEqual({ channel: '1.96.1', targets: ['wasm32-wasip2', 'x'] });
    expect(parseRustToolchain('[toolchain]\nchannel = "1.96.1"\n')).toEqual({
      channel: '1.96.1',
      targets: [],
    });
    expect(() => parseRustToolchain('[toolchain]\n')).toThrow(/channel/);
  });
});

describe('baseIndexScript()', () => {
  test('reads the base upload from the staging directory and removes it', () => {
    const script = baseIndexScript('abc123', '/tmp/testserver.x');
    expect(script).toContain(
      'tar --warning=no-unknown-keyword -xzf /tmp/testserver.x/base.tgz -C /vercel/sandbox'
    );
    expect(script).toContain(
      '--pathspec-from-file=/tmp/testserver.x/base-files'
    );
    expect(script).toContain('rm -f /tmp/testserver.x/base.tgz');
    expect(script).toContain('rm -f /tmp/testserver.x/base-files');
    expect(script).toContain("-m 'base abc123'");
  });
});

describe('applyScript()', () => {
  test("applies the run's upload from the staging directory and removes it", () => {
    const script = applyScript('/tmp/testserver.x');
    expect(script).toContain(
      'git apply --index --binary /tmp/testserver.x/run.patch'
    );
    expect(script).toContain(
      '-xzf /tmp/testserver.x/untracked.tgz -C /vercel/sandbox'
    );
    expect(script).toContain(
      '--pathspec-from-file=/tmp/testserver.x/untracked-files'
    );
    expect(script).toContain(
      'rm -f /tmp/testserver.x/run.patch /tmp/testserver.x/untracked.tgz /tmp/testserver.x/untracked-files'
    );
  });
});

describe('toolchainScript()', () => {
  test('installs the pinned Rust, its targets and a uv Python', () => {
    const script = toolchainScript({
      pnpm: '10.29.3',
      rust: { channel: '1.96.1', targets: ['wasm32-wasip2'] },
    });
    expect(script).toContain('--default-toolchain 1.96.1');
    expect(script).toContain(
      'rustup target add --toolchain 1.96.1 wasm32-wasip2'
    );
    expect(script).toContain('uv python install');
    expect(script).toContain('pnpm@10.29.3');
    expect(script).not.toContain('stable');
  });

  test('pins uv and Go to the versions the CI workflow uses', () => {
    const workflow = load(
      readFileSync(
        new URL(
          '../../../../../../../.github/workflows/cli-testserver.yml',
          import.meta.url
        ),
        'utf8'
      )
    ) as {
      jobs: Record<
        string,
        { steps?: { uses?: string; with?: Record<string, unknown> }[] }
      >;
    };
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
    const pinned = (action: string, input: string) => [
      ...new Set(
        steps
          .filter(step => step.uses?.startsWith(`${action}@`))
          .map(step => String(step.with?.[input]))
      ),
    ];
    expect(pinned('actions/setup-go', 'go-version')).toEqual([GO_VERSION]);
    expect(pinned('astral-sh/setup-uv', 'version')).toEqual([UV_VERSION]);
  });
});

describe('splitNul()', () => {
  test('splits NUL-separated output', () => {
    expect(splitNul(Buffer.from('a\0b c\0'))).toEqual(['a', 'b c']);
    expect(splitNul(Buffer.from(''))).toEqual([]);
  });
});

describe('submodulePaths()', () => {
  test('picks the gitlinks out of `git ls-files --stage` entries', () => {
    expect(
      submodulePaths([
        '100644 0123456789abcdef0123456789abcdef01234567 0\tpackage.json',
        '160000 89abcdef0123456789abcdef0123456789abcdef 0\tvendor/lib',
        '120000 fedcba9876543210fedcba9876543210fedcba98 0\tlink',
      ])
    ).toEqual(['vendor/lib']);
  });
});

describe('partitionUntracked()', () => {
  test('splits nested repositories, listed as `dir/`, from files', () => {
    expect(
      partitionUntracked(['a.ts', 'vendor/clone/', 'src/b.ts', 'other/'])
    ).toEqual({
      untracked: ['a.ts', 'src/b.ts'],
      nestedRepos: ['vendor/clone', 'other'],
    });
  });
});

describe('untrackedSummary()', () => {
  test('lists the paths up to UNTRACKED_LISTED_MAX', () => {
    expect(untrackedSummary([])).toBe('0 untracked files');
    expect(untrackedSummary(['a.ts'])).toBe('1 untracked file: a.ts');
    expect(untrackedSummary(['a.ts', 'src/b.ts'])).toBe(
      '2 untracked files: a.ts, src/b.ts'
    );
    const max = Array.from({ length: UNTRACKED_LISTED_MAX }, (_, i) => `f${i}`);
    expect(untrackedSummary(max)).toBe(
      `${UNTRACKED_LISTED_MAX} untracked files: ${max.join(', ')}`
    );
    expect(untrackedSummary([...max, 'one-more'])).toBe(
      `${UNTRACKED_LISTED_MAX + 1} untracked files`
    );
  });
});

describe('isInstallInputPath()', () => {
  const patterns = ['packages/*', 'api', '!packages/excluded'];

  test('matches root inputs and workspace manifests by path', () => {
    expect(isInstallInputPath('.npmrc', patterns)).toBe(true);
    expect(isInstallInputPath('api/package.json', patterns)).toBe(true);
    expect(isInstallInputPath('packages/deleted/package.json', patterns)).toBe(
      true
    );
  });

  test('skips other files, nested manifests and negated workspaces', () => {
    expect(isInstallInputPath('packages/cli/src/index.ts', patterns)).toBe(
      false
    );
    expect(isInstallInputPath('packages/cli/test/package.json', patterns)).toBe(
      false
    );
    expect(isInstallInputPath('packages/excluded/package.json', patterns)).toBe(
      false
    );
  });
});

describe('installNeededFor()', () => {
  const patterns = ['packages/*'];

  test('is false when no install input changed', () => {
    expect(
      installNeededFor({
        changed: ['packages/cli/src/index.ts'],
        untracked: ['packages/cli/src/new.ts'],
        patterns,
      })
    ).toBe(false);
  });

  test('is true for a changed or untracked install input', () => {
    expect(
      installNeededFor({ changed: ['pnpm-lock.yaml'], untracked: [], patterns })
    ).toBe(true);
    expect(
      installNeededFor({
        changed: [],
        untracked: ['packages/cli/package.json'],
        patterns,
      })
    ).toBe(true);
  });
});

describe('INSTALL_SCRIPT and BUILD_SCRIPT', () => {
  test('install with the lockfile, and build with only the local turbo cache', () => {
    expect(INSTALL_SCRIPT).toContain('pnpm install --frozen-lockfile');
    expect(BUILD_SCRIPT).toContain(
      'turbo --no-update-notifier run build:package --filter=vercel --cache=local:rw'
    );
    // Both builds stream the output of every task that runs.
    expect(BUILD_SCRIPT).toContain('--output-logs=new-only --log-order=stream');
    for (const script of [INSTALL_SCRIPT, BUILD_SCRIPT]) {
      expect(script).toContain('unset TURBO_TOKEN TURBO_TEAM TURBO_API');
      expect(script).toContain('$HOME/.cargo/bin');
      expect(script).toMatch(/^set -euo pipefail\ncd \/vercel\/sandbox\n/);
    }
  });
});

describe('the git side, on a temp repo', () => {
  let root: string;

  beforeEach(() => {
    root = makeGitRepo();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('resolveBase()', () => {
    let base: string;
    const branchWork = () => {
      writeRepoFile(root, 'packages/cli/src/index.ts', 'export const a = 2;\n');
      git(root, 'commit', '-q', '--no-verify', '-am', 'branch work');
    };
    /** A commit on top of `ref`, which then points at it. */
    const advance = (ref: string) => {
      const tree = git(root, 'rev-parse', `${ref}^{tree}`).trim();
      const commit = git(
        root,
        'commit-tree',
        tree,
        '-p',
        ref,
        '-m',
        `advance ${ref}`
      ).trim();
      git(root, 'update-ref', ref, commit);
    };
    beforeEach(() => {
      base = git(root, 'rev-parse', 'HEAD').trim();
    });

    test("is HEAD's merge-base with local main", async () => {
      branchWork();
      // origin/main moving on past HEAD doesn't change the merge-base.
      advance('refs/remotes/origin/main');
      expect(await resolveBase(root)).toEqual({ base, ref: 'main' });
    });

    test('takes local main when its merge-base is newer', async () => {
      advance('refs/heads/main');
      git(root, 'rebase', '-q', 'main');
      const newer = git(root, 'rev-parse', 'main').trim();
      branchWork();
      expect(await resolveBase(root)).toEqual({ base: newer, ref: 'main' });
    });

    test('takes origin/main when local main is stale', async () => {
      advance('refs/remotes/origin/main');
      git(root, 'rebase', '-q', 'origin/main');
      const newer = git(root, 'rev-parse', 'origin/main').trim();
      branchWork();
      expect(await resolveBase(root)).toEqual({
        base: newer,
        ref: 'origin/main',
      });
    });

    test('takes local main when the merge-bases have diverged', async () => {
      // HEAD merges a main-only and an origin/main-only commit, so neither
      // merge-base contains the other.
      advance('refs/heads/main');
      advance('refs/remotes/origin/main');
      const local = git(root, 'rev-parse', 'main').trim();
      git(root, 'reset', '-q', '--hard', 'origin/main');
      git(root, 'merge', '-q', '--no-edit', '--no-verify', 'main');
      branchWork();
      expect(await resolveBase(root)).toEqual({ base: local, ref: 'main' });
    });

    test('falls back to origin/main without local main', async () => {
      branchWork();
      git(root, 'branch', '-D', 'main');
      expect(await resolveBase(root)).toEqual({ base, ref: 'origin/main' });
    });

    test('falls back to origin/main when main shares no history with HEAD', async () => {
      branchWork();
      const tree = git(root, 'rev-parse', 'HEAD^{tree}').trim();
      const orphan = git(root, 'commit-tree', tree, '-m', 'orphan').trim();
      git(root, 'update-ref', 'refs/heads/main', orphan);
      expect(await resolveBase(root)).toEqual({ base, ref: 'origin/main' });
    });

    test('fails with a fetch hint when neither ref exists', async () => {
      git(root, 'branch', '-D', 'main');
      git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
      await expect(resolveBase(root)).rejects.toMatchObject({
        name: 'RunnerError',
        message: expect.stringMatching(
          /`main` does not exist and `origin\/main` does not exist\. Run `git fetch origin main`/
        ),
        hint: LOCAL_BUILD_HINT,
      });
    });
  });

  test('baseRustToolchain() reads the base, not the working tree', async () => {
    const base = git(root, 'rev-parse', 'HEAD').trim();
    writeRepoFile(
      root,
      'packages/python-analysis/rust-toolchain.toml',
      '[toolchain]\nchannel = "1.99.0"\n'
    );
    expect(await baseRustToolchain(root, base)).toEqual({
      channel: '1.96.1',
      targets: ['wasm32-wasip2'],
    });
  });

  test('basePnpmVersion() reads the base, not the working tree', async () => {
    const base = git(root, 'rev-parse', 'HEAD').trim();
    writeRepoFile(
      root,
      'package.json',
      JSON.stringify({ packageManager: 'pnpm@11.0.0' })
    );
    expect(await basePnpmVersion(root, base)).toBe('10.29.3');
  });

  test('baseArchive() packs exactly the tracked files', async () => {
    const base = git(root, 'rev-parse', 'HEAD').trim();
    writeRepoFile(root, 'untracked.txt', 'x');
    const { tarball, fileList, files } = await baseArchive(root, base);
    const tracked = splitNul(fileList);
    expect(tracked).toEqual(splitNul(git(root, 'ls-files', '-z')));
    expect(files).toBe(tracked.length);
    const listed = execFileSync('tar', ['-tzf', '-'], { input: tarball })
      .toString()
      .split('\n')
      .filter(name => name && !name.endsWith('/'));
    expect(listed.sort()).toEqual([...tracked].sort());
  });

  describe('assembleRunPayload()', () => {
    let base: string;

    beforeEach(() => {
      writeRepoFile(root, 'assets/logo.bin', '');
      writeFileSync(
        join(root, 'assets/logo.bin'),
        new Uint8Array([0, 1, 2, 3, 255])
      );
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '--no-verify', '-m', 'binary');
      git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      base = git(root, 'rev-parse', 'HEAD').trim();
    });

    test('is empty with no changes', async () => {
      const payload = await assembleRunPayload(root, base);
      expect(payload).toEqual({
        patch: Buffer.alloc(0),
        untracked: [],
        untrackedTarball: undefined,
        nestedRepos: [],
        installNeeded: false,
      });
    });

    test('fails on a checkout with a submodule', async () => {
      git(
        root,
        'update-index',
        '--add',
        '--cacheinfo',
        `160000,${base},vendor/lib`
      );
      await expect(assembleRunPayload(root, base)).rejects.toMatchObject({
        message: expect.stringContaining(
          "The runner can't build a checkout with Git submodules (vendor/lib)"
        ),
        hint: LOCAL_BUILD_HINT,
      });
    });

    test('leaves out an untracked nested Git repository', async () => {
      const nested = join(root, 'packages/cli/scratch');
      writeRepoFile(root, 'packages/cli/scratch/.gitignore', '.env\n');
      writeRepoFile(root, 'packages/cli/scratch/index.ts', 'nested\n');
      writeRepoFile(root, 'packages/cli/scratch/.env', 'SECRET=1\n');
      git(nested, 'init', '-q');
      writeRepoFile(root, 'packages/cli/src/new.ts', 'untracked\n');

      const payload = await assembleRunPayload(root, base);
      expect(payload.untracked).toEqual(['packages/cli/src/new.ts']);
      expect(payload.nestedRepos).toEqual(['packages/cli/scratch']);
      const listing = execFileSync('tar', ['-tzf', '-'], {
        input: payload.untrackedTarball,
      })
        .toString()
        .split('\n')
        .filter(Boolean);
      expect(listing).toEqual(['packages/cli/src/new.ts']);
    });

    test('carries every kind of change, and applies to the base', async () => {
      // Committed on the branch, staged, and unstaged changes all count.
      writeRepoFile(root, 'packages/cli/src/index.ts', 'export const a = 2;\n');
      git(root, 'commit', '-q', '--no-verify', '-am', 'branch work');
      writeRepoFile(root, 'packages/cli/src/staged.ts', 'staged\n');
      git(root, 'add', 'packages/cli/src/staged.ts');
      rmSync(join(root, 'packages/builder/src/index.ts'));
      writeFileSync(
        join(root, 'assets/logo.bin'),
        new Uint8Array([9, 0, 8, 255, 7])
      );
      chmodSync(
        join(
          root,
          'packages/cli/test/testserver/commands/whoami/whoami.test.ts'
        ),
        0o755
      );
      writeRepoFile(root, 'packages/cli/src/[slug]/new.ts', 'untracked\n');
      symlinkSync('index.ts', join(root, 'packages/cli/src/link.ts'));
      writeRepoFile(root, 'packages/cli/dist/index.js', 'ignored\n');

      const payload = await assembleRunPayload(root, base);
      expect(payload.installNeeded).toBe(false);
      expect(payload.untracked.sort()).toEqual([
        'packages/cli/src/[slug]/new.ts',
        'packages/cli/src/link.ts',
      ]);

      // Rebuild the working tree from the base, the patch and the tarball.
      const clone = mkdtempSync(join(tmpdir(), 'testserver-runner-clone-'));
      const patchDir = mkdtempSync(join(tmpdir(), 'testserver-runner-patch-'));
      try {
        execFileSync('git', ['clone', '-q', '--no-checkout', root, clone], {
          env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
        });
        git(clone, 'checkout', '-q', base);
        const patchFile = join(patchDir, 'run.patch');
        writeFileSync(patchFile, payload.patch);
        git(clone, 'apply', '--index', '--binary', patchFile);
        // Extract in tar's cwd: GNU tar (Git for Windows) can't open a
        // `C:\...` path passed to `-C`.
        execFileSync('tar', ['-xzf', '-'], {
          cwd: clone,
          input: payload.untrackedTarball,
        });

        const read = (path: string) => readFileSync(join(clone, path));
        expect(read('packages/cli/src/index.ts').toString()).toBe(
          'export const a = 2;\n'
        );
        expect(read('packages/cli/src/staged.ts').toString()).toBe('staged\n');
        expect(existsSync(join(clone, 'packages/builder/src/index.ts'))).toBe(
          false
        );
        expect([...read('assets/logo.bin')]).toEqual([9, 0, 8, 255, 7]);
        // Windows has no exec bit to carry.
        if (process.platform !== 'win32') {
          expect(
            lstatSync(
              join(
                clone,
                'packages/cli/test/testserver/commands/whoami/whoami.test.ts'
              )
            ).mode & 0o111
          ).not.toBe(0);
        }
        expect(read('packages/cli/src/[slug]/new.ts').toString()).toBe(
          'untracked\n'
        );
        // Git for Windows' tar extracts a symlink as a copy of its target.
        if (process.platform !== 'win32') {
          expect(readlinkSync(join(clone, 'packages/cli/src/link.ts'))).toBe(
            'index.ts'
          );
        } else {
          expect(existsSync(join(clone, 'packages/cli/src/link.ts'))).toBe(
            true
          );
        }
        expect(existsSync(join(clone, 'packages/cli/dist/index.js'))).toBe(
          false
        );
      } finally {
        rmSync(clone, { recursive: true, force: true });
        rmSync(patchDir, { recursive: true, force: true });
      }
    });

    test('applies to the base archive with diff.context zero and core.autocrlf', async () => {
      writeRepoFile(
        root,
        'source.txt',
        'first\nsecond\nthird\nfourth\nfifth\n'
      );
      git(root, 'add', 'source.txt');
      git(root, 'commit', '-q', '--no-verify', '-m', 'source with context');
      const sourceBase = git(root, 'rev-parse', 'HEAD').trim();
      git(root, 'config', 'diff.context', '0');
      // Git for Windows' system default; the archive must still be LF.
      git(root, 'config', 'core.autocrlf', 'true');
      const changed = 'first\nsecond\nchanged\nfourth\nfifth\n';
      writeRepoFile(root, 'source.txt', changed);

      const { patch } = await assembleRunPayload(root, sourceBase);
      const { tarball } = await baseArchive(root, sourceBase);
      const restored = mkdtempSync(
        join(tmpdir(), 'testserver-runner-restore-')
      );
      try {
        execFileSync('tar', ['-xzf', '-'], { cwd: restored, input: tarball });
        execFileSync('git', ['apply', '--binary', '-'], {
          cwd: restored,
          env: GIT_ENV,
          input: patch,
        });
        expect(readFileSync(join(restored, 'source.txt'), 'utf8')).toBe(
          changed
        );
      } finally {
        rmSync(restored, { recursive: true, force: true });
      }
    });

    test.each([
      ['packages/utils/package.json', true],
      ['api/package.json', true],
      ['packages/builder/package.json', false],
    ])('detects install changes to %s with ./ workspace patterns', async (path, expected) => {
      writeRepoFile(
        root,
        'pnpm-workspace.yaml',
        "packages:\n  - './packages/*'\n  - './api'\n  - '!./packages/builder'\n"
      );
      git(
        root,
        'commit',
        '-q',
        '--no-verify',
        '-am',
        'relative workspace patterns'
      );
      const workspaceBase = git(root, 'rev-parse', 'HEAD').trim();
      expect(
        (await assembleRunPayload(root, workspaceBase)).installNeeded
      ).toBe(false);

      // The workspace YAML is unchanged; only the manifest can trigger install.
      writeRepoFile(root, path, JSON.stringify({ name: 'changed' }));
      expect(
        (await assembleRunPayload(root, workspaceBase)).installNeeded
      ).toBe(expected);
    });

    test('needs an install when the lockfile changes', async () => {
      writeRepoFile(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.1\n');
      expect((await assembleRunPayload(root, base)).installNeeded).toBe(true);
    });

    test('needs an install when a workspace manifest changes', async () => {
      writeRepoFile(
        root,
        'packages/utils/package.json',
        JSON.stringify({ name: '@vercel/utils', version: '2.0.0' })
      );
      expect((await assembleRunPayload(root, base)).installNeeded).toBe(true);
    });

    test.each([
      '.npmrc',
      'packages/utils/package.json',
    ])('needs an install when %s is deleted', async path => {
      rmSync(join(root, path));
      expect((await assembleRunPayload(root, base)).installNeeded).toBe(true);
    });

    test('needs an install for an untracked new workspace manifest', async () => {
      writeRepoFile(
        root,
        'packages/new/package.json',
        JSON.stringify({ name: '@vercel/new' })
      );
      const payload = await assembleRunPayload(root, base);
      expect(payload.untracked).toEqual(['packages/new/package.json']);
      expect(payload.installNeeded).toBe(true);
    });
  });
});

/** The step a runner-build script takes, told apart by what it runs. */
function stepOf(cmd: string, args: string[] = []): string {
  if (cmd !== 'bash') return cmd;
  const script = args.join(' ');
  if (script.includes('git apply')) return 'apply';
  if (script.includes('pnpm install')) return 'install';
  if (script.includes('turbo')) return 'build';
  return 'bash';
}

/** The staging directory the fake sandboxes' `mktemp -d` makes. */
const STAGING = '/tmp/testserver.test';

/**
 * A sandbox that records what the mode writes and runs. Every command prints
 * `<step> output` and exits with `exits[step]`, or 0. `mktemp` prints
 * STAGING and isn't recorded as a step.
 */
function fakeSandbox(exits: Record<string, number> = {}) {
  const written: { path: string; content: string | Uint8Array }[] = [];
  const steps: string[] = [];
  return {
    name: 'sbx_1',
    written,
    steps,
    async writeFiles(files: { path: string; content: string | Uint8Array }[]) {
      written.push(...files);
    },
    async runCommand({ cmd, args }: { cmd: string; args?: string[] }) {
      if (cmd === 'mktemp') {
        return { exitCode: 0, stdout: async () => `${STAGING}\n` };
      }
      const step = stepOf(cmd, args);
      steps.push(step);
      const exitCode = exits[step] ?? 0;
      return {
        exitCode,
        output: async () => `${step} output`,
        async *logs() {
          yield { stream: 'stdout' as const, data: `${step} output\n` };
        },
        wait: async () => ({ exitCode }),
      };
    },
  };
}

describe('runnerBuildMode()', () => {
  let root: string;
  let base: string;
  let logs: string[];
  const log = (line: string) => logs.push(line);
  const signal = new AbortController().signal;

  beforeEach(() => {
    root = makeGitRepo();
    base = git(root, 'rev-parse', 'HEAD').trim();
    logs = [];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('keys its snapshot on the merge-base', async () => {
    const mode = await runnerBuildMode({ repoRoot: root });
    expect(mode.snapshot.key).toBe(
      snapshotKey({ base, format: SNAPSHOT_FORMAT })
    );
    expect(mode.snapshot).toMatchObject({
      vcpus: 8,
      builtFor: `merge-base ${base.slice(0, 12)}`,
      entry: { base },
    });
    expect(mode.snapshot.missMessage).toContain(
      `No runner snapshot yet for merge-base ${base.slice(0, 12)}`
    );
    expect(mode.startedNote).toBe(
      ` (merge-base ${base.slice(0, 12)} with main)`
    );
    // At least 8 for the build, more when the tests need it.
    expect(mode.vcpus(1)).toBe(8);
    expect(mode.vcpus(8)).toBe(16);
    // The factory assembled the upload before returning.
    await expect(mode.ready).resolves.toBeUndefined();
  });

  test('names origin/main when it falls back to it', async () => {
    git(root, 'branch', '-D', 'main');
    const mode = await runnerBuildMode({ repoRoot: root });
    expect(mode.startedNote).toBe(
      ` (merge-base ${base.slice(0, 12)} with origin/main)`
    );
    expect(mode.summary).toContain('the newest origin/main commit');
  });

  test('fails with a fetch hint without main or origin/main', async () => {
    git(root, 'branch', '-D', 'main');
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
    await expect(runnerBuildMode({ repoRoot: root })).rejects.toMatchObject({
      name: 'RunnerError',
      message: expect.stringContaining('git fetch origin main'),
    });
  });

  test('refuses a checkout with a submodule before any sandbox starts', async () => {
    git(
      root,
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${base},vendor/lib`
    );
    await expect(runnerBuildMode({ repoRoot: root })).rejects.toMatchObject({
      name: 'RunnerError',
      message: expect.stringContaining(
        "The runner can't build a checkout with Git submodules (vendor/lib)"
      ),
    });
  });

  test('its snapshot recipe uploads the base, then installs the toolchains, commits, installs and builds', async () => {
    const mode = await runnerBuildMode({ repoRoot: root });
    const recipe = mode.snapshot.begin({ log, prefix: '[runner snapshot]' });
    const sandbox = fakeSandbox();
    const steps: [string, string][] = [];
    await recipe(sandbox, async (label: string, script: string) => {
      steps.push([label, script]);
    });

    expect(sandbox.written.map(f => f.path)).toEqual([
      `${STAGING}/base.tgz`,
      `${STAGING}/base-files`,
    ]);
    expect(String(sandbox.written[1].content)).toBe(
      git(root, 'ls-files', '-z')
    );
    expect(steps.map(([label]) => label)).toEqual([
      'Installing the toolchains',
      'Committing the base tree',
      'pnpm install',
      'The CLI build',
    ]);
    // The toolchains are the base's.
    expect(steps[0][1]).toContain('pnpm@10.29.3');
    expect(steps[0][1]).toContain('--default-toolchain 1.96.1');
    expect(steps[1][1]).toBe(baseIndexScript(base, STAGING));
    expect(steps[2][1]).toBe(INSTALL_SCRIPT);
    expect(steps[3][1]).toBe(BUILD_SCRIPT);
    expect(logs).toEqual([
      expect.stringMatching(
        new RegExp(
          `^\\[runner snapshot\\] ✓ Uploaded merge-base ${base.slice(0, 12)} \\(\\d+ files, `
        )
      ),
    ]);
  });

  test('uploads the changes, applies them, and builds with streamed output', async () => {
    writeRepoFile(root, 'packages/cli/src/index.ts', 'export const a = 2;\n');
    writeRepoFile(root, 'packages/cli/src/new.ts', 'new\n');
    const mode = await runnerBuildMode({ repoRoot: root });
    const sandbox = fakeSandbox();
    const phases: string[] = [];
    await mode.apply(sandbox, { phases, log, signal });

    expect(sandbox.written.map(f => f.path)).toEqual([
      `${STAGING}/run.patch`,
      `${STAGING}/untracked.tgz`,
      `${STAGING}/untracked-files`,
    ]);
    expect(String(sandbox.written[0].content)).toContain(
      '+export const a = 2;'
    );
    expect(String(sandbox.written[2].content)).toBe(
      'packages/cli/src/new.ts\0'
    );
    expect(sandbox.steps).toEqual(['apply', 'build']);
    expect(phases).toEqual([
      expect.stringMatching(/^upload \d+\.\d MB \d+\.\ds$/),
      expect.stringMatching(/^apply \d+\.\ds$/),
      'install skipped',
      expect.stringMatching(/^build \d+\.\ds$/),
    ]);
    expect(logs).toContainEqual(
      expect.stringMatching(
        new RegExp(
          `^✓ \\[runner\\] Uploaded the changes from ${base.slice(0, 12)} \\(.* patch and 1 untracked file: packages/cli/src/new\\.ts\\) in `
        )
      )
    );
    expect(logs).toContainEqual('[runner build] build output');
    expect(logs).toContainEqual(
      expect.stringMatching(
        /^\[runner build\] ── turbo build output from runner sbx_1 /
      )
    );
    expect(logs).toContainEqual(
      expect.stringMatching(
        /^\[runner build\] ── end of turbo build output: done in \d+\.\ds /
      )
    );
  });

  test('installs in the runner when an install input changed', async () => {
    writeRepoFile(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.1\n');
    const mode = await runnerBuildMode({ repoRoot: root });
    const sandbox = fakeSandbox();
    const phases: string[] = [];
    await mode.apply(sandbox, { phases, log, signal });

    expect(sandbox.steps).toEqual(['apply', 'install', 'build']);
    expect(phases[2]).toMatch(/^install \d+\.\ds$/);
    expect(logs).toContainEqual('[runner install] install output');
  });

  test('names the untracked nested Git repositories it leaves out', async () => {
    writeRepoFile(root, 'packages/cli/scratch/index.ts', 'nested\n');
    git(join(root, 'packages/cli/scratch'), 'init', '-q');
    const mode = await runnerBuildMode({ repoRoot: root });
    const sandbox = fakeSandbox();
    await mode.apply(sandbox, {
      phases: [],
      log,
      signal,
    });
    expect(sandbox.written).toEqual([]);
    expect(logs).toContainEqual(
      '! [runner] Not uploading an untracked nested Git repository: packages/cli/scratch'
    );
  });

  test('uploads nothing when nothing changed', async () => {
    const mode = await runnerBuildMode({ repoRoot: root });
    const sandbox = fakeSandbox();
    await mode.apply(sandbox, {
      phases: [],
      log,
      signal,
    });
    expect(sandbox.written).toEqual([]);
  });

  test('uploads the changes as they were when the mode was built', async () => {
    const mode = await runnerBuildMode({ repoRoot: root });
    writeRepoFile(root, 'packages/cli/src/later.ts', 'later\n');
    const sandbox = fakeSandbox();
    await mode.apply(sandbox, { phases: [], log, signal });
    expect(sandbox.written).toEqual([]);
  });

  test('throws with the output tail when the CLI build fails', async () => {
    const mode = await runnerBuildMode({ repoRoot: root });
    const sandbox = fakeSandbox({ build: 2 });
    const phases: string[] = [];

    await expect(
      mode.apply(sandbox, { phases, log, signal })
    ).rejects.toMatchObject({
      name: 'RunnerError',
      message: 'The CLI build failed in runner sbx_1 (exit 2):\nbuild output',
      hint: LOCAL_HINT,
    });
    expect(phases.at(-1)).toBe('install skipped');
    expect(logs).toContainEqual(
      expect.stringMatching(
        /^\[runner build\] ── end of turbo build output: failed /
      )
    );
  });
});
