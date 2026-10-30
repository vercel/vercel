const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const {
  access,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { promisify } = require('node:util');
const test = globalThis.test || require('node:test').test;
const {
  checkCliInstall,
  installWarnings,
} = require('../../utils/check-cli-install');

const exec = promisify(execFile);
const clean = { stdout: 'added 10 packages', stderr: '' };

for (const warning of [
  'npm WARN deprecated stream-to-promise@2.2.0: Deprecated.',
  'npm warn deprecated tar@7.5.7: Old versions are not supported.',
  '\u2009WARN\u2009 2 deprecated subdependencies found: stream-to-promise@2.2.0, tar@7.5.7',
  '\u2009WARN\u2009 deprecated tar@7.5.7: Old versions are not supported.',
  'npm WARN EBADENGINE Unsupported engine {',
  'npm warn EBADENGINE Unsupported engine {',
  '\u2009WARN\u2009 Unsupported engine: wanted: {"node":">=20"}',
  '\u2009ERR_PNPM_UNSUPPORTED_ENGINE\u2009 Unsupported environment',
]) {
  for (const stream of ['stdout', 'stderr']) {
    test(`detects ${warning.trim()} on ${stream}`, () => {
      assert.deepEqual(installWarnings({ [stream]: warning }), [warning]);
    });
  }
}

test('strips ANSI before checking warnings', () => {
  assert.deepEqual(
    installWarnings({
      stdout:
        '\u001b[33mWARN\u001b[0m 1 deprecated subdependency found: tar@7.5.7',
    }),
    ['WARN 1 deprecated subdependency found: tar@7.5.7']
  );
});

test('does not fail on normal output, package names, or unrelated warnings', () => {
  assert.deepEqual(
    installWarnings({
      stdout:
        'added deprecated-package@1.0.0\n0 deprecated packages\nDone in 5s',
      stderr:
        'npm warn config Unknown config option\nWARN Ignored build scripts',
    }),
    []
  );
});

async function withTarball(check) {
  const fixture = await realpath(
    await mkdtemp(join(tmpdir(), 'vercel-install-test-'))
  );
  const tarball = join(fixture, 'vercel.tgz');
  await writeFile(
    tarball,
    'Test double; never passed to a real package manager.'
  );
  try {
    await check(tarball, fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

for (const manager of ['npm', 'pnpm']) {
  test(`${manager}: installs outside the workspace with fresh configuration, then runs the installed CLI`, async () => {
    await withTarball(async tarball => {
      let root;
      const calls = [];
      await checkCliInstall({
        manager,
        executable: process.execPath,
        tarball,
        log: () => {},
        run: async (command, args, options) => {
          calls.push({ command, args });
          if (calls.length === 1) {
            root = dirname(options.cwd);
            assert.notEqual(options.cwd, process.cwd());
            assert.equal(options.env.npm_config_cache, join(root, 'npm-cache'));
            await assert.rejects(access(options.env.npm_config_cache));
            assert.equal(options.env.HOME, join(root, 'home'));
            assert.equal(options.env.NODE_OPTIONS, undefined);
            assert.equal(options.env.NPM_TOKEN, undefined);
            assert.equal(options.env.npm_config_ignore_scripts, undefined);
            assert.equal(options.env.npm_config_loglevel, undefined);
            assert.equal(
              await readFile(options.env.npm_config_userconfig, 'utf8'),
              ''
            );
            const config = await readFile(
              options.env.npm_config_globalconfig,
              'utf8'
            );
            assert.match(config, /^engine-strict=true$/m);
            if (manager === 'pnpm') {
              assert.match(config, /^store-dir=.+/m);
              await assert.rejects(access(join(root, 'store')));
            }
            assert.ok(args.includes('--global'));
            assert.ok(args.includes(tarball));
            assert.ok(!args.includes('--ignore-scripts'));
            return clean;
          }
          assert.equal(
            command,
            join(
              root,
              ...(manager === 'npm' ? ['prefix', 'bin'] : ['bin']),
              'vercel'
            )
          );
          assert.deepEqual(args, ['--version']);
          return { stdout: '60.1.3\n', stderr: 'Vercel CLI 60.1.3\n' };
        },
      });
      assert.equal(calls.length, 2);
      await assert.rejects(access(root), { code: 'ENOENT' });
    });
  });
}

for (const stream of ['stdout', 'stderr']) {
  test(`fails on zero-exit install warnings in ${stream} and cleans up`, async () => {
    await withTarball(async tarball => {
      let root;
      let calls = 0;
      await assert.rejects(
        checkCliInstall({
          manager: 'npm',
          executable: process.execPath,
          tarball,
          log: () => {},
          run: async (_command, _args, options) => {
            root = dirname(options.cwd);
            calls++;
            return { ...clean, [stream]: 'npm warn deprecated tar@7.5.7: old' };
          },
        }),
        /install emitted dependency warnings:\nnpm warn deprecated tar@7.5.7/
      );
      assert.equal(calls, 1);
      await assert.rejects(access(root), { code: 'ENOENT' });
    });
  });
}

for (const failedCall of [1, 2]) {
  test(`fails on ${failedCall === 1 ? 'installation' : 'CLI startup'} errors, preserving both streams`, async () => {
    await withTarball(async tarball => {
      let root;
      let calls = 0;
      await assert.rejects(
        checkCliInstall({
          manager: 'pnpm',
          executable: process.execPath,
          tarball,
          log: () => {},
          run: async (_command, _args, options) => {
            root = dirname(options.cwd);
            if (++calls === failedCall) {
              throw Object.assign(new Error('exit 1'), {
                stdout: 'stdout diagnostic',
                stderr: 'stderr diagnostic',
              });
            }
            return clean;
          },
        }),
        /exit 1\nstdout diagnostic\nstderr diagnostic/
      );
      assert.equal(calls, failedCall);
      await assert.rejects(access(root), { code: 'ENOENT' });
    });
  });
}

test('does not duplicate stderr already included in an installer error', async () => {
  await withTarball(async tarball => {
    await assert.rejects(
      checkCliInstall({
        manager: 'npm',
        executable: process.execPath,
        tarball,
        log: () => {},
        run: async () => {
          throw Object.assign(
            new Error('Command failed: npm install\nstderr diagnostic\n'),
            {
              stdout: 'stdout diagnostic',
              stderr: 'stderr diagnostic\n',
            }
          );
        },
      }),
      error => {
        assert.equal(error.message.split('stderr diagnostic').length - 1, 1);
        assert.match(error.message, /stdout diagnostic/);
        return true;
      }
    );
  });
});

test('rejects an installed CLI that produces no version output', async () => {
  await withTarball(async tarball => {
    await assert.rejects(
      checkCliInstall({
        manager: 'npm',
        executable: process.execPath,
        tarball,
        log: () => {},
        run: async () => ({ stdout: '', stderr: '' }),
      }),
      /vercel --version returned no output/
    );
  });
});

test('entrypoint exits nonzero even when the package manager exits zero with a warning', async () => {
  await withTarball(async (tarball, fixture) => {
    const manager = join(fixture, 'manager.js');
    await writeFile(
      manager,
      "process.stdout.write('WARN 1 deprecated subdependency found: tar@7.5.7');"
    );
    await assert.rejects(
      exec(process.execPath, [
        require.resolve('../../utils/check-cli-install'),
        'pnpm',
        manager,
        tarball,
      ]),
      error => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /install emitted dependency warnings/);
        assert.match(error.stdout, /deprecated subdependency/);
        return true;
      }
    );
  });
});

test('rejects unsupported managers without running an installer', async () => {
  await assert.rejects(checkCliInstall({ manager: 'yarn' }), /Usage:/);
});
