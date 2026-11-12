const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { delimiter, join, resolve } = require('node:path');
const { promisify } = require('node:util');
const test = globalThis.test || require('node:test').test;
const execFileAsync = promisify(execFile);
const script = resolve(__dirname, '../../utils/npm-publish.sh');
const sha = 'a'.repeat(40);
const integrity = createHash('sha512')
  .update('saved CLI bytes')
  .digest('base64');
const registryIntegrity = `sha512-${createHash('sha512')
  .update('different published CLI bytes')
  .digest('base64')}`;

// No registry access, workspace or dependency install. The publisher can only
// use saved bytes; every curl/npm invocation is recorded by local executables.
async function fixture(check) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'npm publish ')));
  const bin = join(root, 'bin');
  const payload = join(root, 'saved packages');
  try {
    await mkdir(bin);
    await mkdir(payload);
    await mkdir(join(root, 'utils'));
    await copyFile(script, join(root, 'utils/npm-publish.sh'));
    const manifest = {
      sourceSha: sha,
      packages: [
        { name: '@vercel/node', version: '1.0.0', tarball: 'node.tgz' },
        {
          name: 'vercel',
          version: '1.0.0',
          tarball: 'vercel.tgz',
          integrity: `sha512-${integrity}`,
        },
      ],
    };
    await writeFile(join(payload, 'node.tgz'), 'saved builder bytes');
    await writeFile(join(payload, 'vercel.tgz'), 'saved CLI bytes');
    const stub = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.FIXTURE_ROOT;
const config = JSON.parse(fs.readFileSync(path.join(root, 'mock.json')));
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const call = { tool, args, cwd: process.cwd(), pathKeys: Object.keys(process.env).filter(key => key.toLowerCase() === 'path') };
if (tool === 'npm' && args[0] === 'publish') call.bytes = fs.readFileSync(args[1], 'utf8');
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(call) + '\\n');
if (tool === 'curl') {
  const url = new URL(args.at(-1));
  if (url.origin !== 'https://registry.npmjs.org') throw new Error('Unexpected registry');
  const [name, selector, extra] = url.pathname.slice(1).split('/').map(decodeURIComponent);
  if (extra || !selector || name.includes('tarball')) throw new Error('Unexpected download');
  const key = name + '@' + selector;
  const file = path.join(root, 'counts.json');
  const counts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
  const index = counts[key] || 0;
  counts[key] = index + 1;
  fs.writeFileSync(file, JSON.stringify(counts));
  const responses = config.lookups?.[key] || [{ status: 404 }];
  const response = responses[Math.min(index, responses.length - 1)];
  const body = response.raw ?? JSON.stringify(response.body ?? { name, version: selector });
  fs.writeFileSync(args[args.indexOf('--output') + 1], body);
  process.stdout.write(String(response.status ?? 200));
  process.exit(response.exitCode || 0);
}
if (tool !== 'npm' || args[0] !== 'publish') throw new Error('Unexpected ' + tool + ' ' + args);
process.exit(config.publishExit || 0);
`;
    for (const tool of ['curl', 'npm', 'pnpm']) {
      await writeFile(join(bin, tool), stub);
      await chmod(join(bin, tool), 0o755);
    }
    const run = async (config = {}, env = {}, args = [payload]) => {
      await writeFile(join(payload, 'manifest.json'), JSON.stringify(manifest));
      await writeFile(join(root, 'mock.json'), JSON.stringify(config));
      const childEnv = {
        ...process.env,
        FIXTURE_ROOT: root,
        GITHUB_ENV: join(root, 'github-env'),
        NPM_PUBLISH_ONLY: '',
        NPM_PUBLISH_EXCLUDE: '',
        ...env,
      };
      // Windows treats PATH keys case-insensitively. Pass only one spelling to
      // Node's spawn, using the native delimiter before Git Bash imports PATH.
      const pathKeys = Object.keys(childEnv).filter(
        key => key.toLowerCase() === 'path'
      );
      const inheritedPath = childEnv.PATH ?? childEnv[pathKeys[0]] ?? '';
      for (const key of pathKeys) delete childEnv[key];
      childEnv.PATH = `${bin}${delimiter}${inheritedPath}`;
      return execFileAsync(
        'bash',
        [join(root, 'utils/npm-publish.sh'), ...args],
        { cwd: root, env: childEnv }
      );
    };
    const calls = async () =>
      (await readFile(join(root, 'calls.jsonl'), 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const call = JSON.parse(line);
          // Git Bash can pass native Windows paths with forward slashes.
          if (process.platform === 'win32') {
            call.cwd = resolve(call.cwd);
            if (call.tool === 'npm' && call.args[0] === 'publish') {
              call.args[1] = resolve(call.args[1]);
            }
          }
          return call;
        });
    await check({ root, payload, manifest, run, calls });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const onlyCli = { NPM_PUBLISH_ONLY: 'vercel' };
const notCli = { NPM_PUBLISH_EXCLUDE: 'vercel' };
const present = (version, distIntegrity, name = 'vercel') => ({
  status: 200,
  body: {
    name,
    version,
    ...(distIntegrity === undefined
      ? {}
      : { dist: { integrity: distIntegrity } }),
  },
});

test('publishes saved bytes in manifest order with scripts and retries disabled', async () => {
  await fixture(async ({ root, payload, manifest, run, calls }) => {
    manifest.packages.reverse(); // Never rediscover or alphabetize this order.
    const { stdout } = await run({}, { NPM_CONFIG_TAG: 'unexpected-tag' });
    const all = await calls();
    const publishes = all.filter(call => call.tool === 'npm');
    // Only vercel waits on canary for manual promotion.
    assert.deepEqual(
      publishes.map(call => call.args),
      [
        ['vercel.tgz', 'canary'],
        ['node.tgz', 'latest'],
      ].map(([file, tag]) => [
        'publish',
        join(payload, file),
        '--ignore-scripts',
        '--fetch-retries=0',
        '--access',
        'public',
        '--registry=https://registry.npmjs.org',
        '--tag',
        tag,
      ])
    );
    assert.deepEqual(
      publishes.map(call => call.bytes),
      ['saved CLI bytes', 'saved builder bytes']
    );
    const physicalPayload = await realpath(payload);
    assert.ok(publishes.every(call => call.cwd === physicalPayload));
    assert.ok(all.every(call => ['npm', 'curl'].includes(call.tool)));
    assert.match(stdout, /Published 2 packages, skipped 0/);
    assert.equal(
      await readFile(join(root, '.vercel-cli-publish-integrity'), 'utf8'),
      `sha512-${integrity}\n`
    );
    assert.equal(
      await readFile(join(root, 'github-env'), 'utf8'),
      `VERCEL_CLI_PUBLISH_INTEGRITY=sha512-${integrity}\n`
    );
  });
});

for (const retryKey of [
  'NPM_CONFIG_FETCH_RETRIES',
  'npm_config_fetch_retries',
]) {
  test(`fixture deduplicates PATH and retains the CLI retry override with ${retryKey}`, async () => {
    await fixture(async ({ run, calls, root, payload }) => {
      const inheritedPath =
        Object.entries(process.env).find(
          ([key]) => key.toLowerCase() === 'path'
        )?.[1] ?? '';
      await run(
        {},
        {
          ...onlyCli,
          PATH: inheritedPath,
          Path: join(root, 'not-a-bin'),
          [retryKey]: '9',
        }
      );
      const all = await calls();
      for (const call of all) assert.deepEqual(call.pathKeys, ['PATH']);
      const [publish] = all.filter(call => call.tool === 'npm');
      assert.equal(publish.args[1], join(payload, 'vercel.tgz'));
      assert.ok(publish.args.includes('--fetch-retries=0'));
    });
  });
}

for (const [env, expected, lookups] of [
  [{ NPM_PUBLISH_EXCLUDE: 'vercel' }, 'node.tgz', 2],
  [onlyCli, 'vercel.tgz', 1],
]) {
  test(`preserves release phase filtering: ${JSON.stringify(env)}`, async () => {
    await fixture(async ({ run, calls, payload }) => {
      await run({}, env);
      assert.deepEqual(
        (await calls())
          .filter(call => call.tool === 'npm')
          .map(call => call.args[1]),
        [join(payload, expected)]
      );
      assert.equal(
        (await calls()).filter(call => call.tool === 'curl').length,
        lookups
      );
    });
  });
}

for (const recovered of [false, true]) {
  const label = recovered
    ? 'a failed publish that landed'
    : 'an existing version';

  test(`treats ${label} with the saved CLI bytes as this release`, async () => {
    await fixture(async ({ run, calls, root }) => {
      const metadata = present('1.0.0', `sha512-${integrity}`);
      await run(
        {
          publishExit: recovered ? 1 : 0,
          lookups: {
            'vercel@1.0.0': recovered
              ? [{ status: 404 }, metadata]
              : [metadata],
          },
        },
        onlyCli
      );
      assert.deepEqual(
        (await calls()).map(call => call.tool),
        recovered ? ['curl', 'npm', 'curl'] : ['curl']
      );
      // Recorded, so native acceptance and release notes still run.
      assert.equal(
        await readFile(join(root, '.vercel-cli-publish-integrity'), 'utf8'),
        `sha512-${integrity}\n`
      );
    });
  });

  test(`fails on ${label} with different CLI bytes`, async () => {
    await fixture(async ({ run, root }) => {
      const file = join(root, '.vercel-cli-publish-integrity');
      await writeFile(file, 'stale\n');
      const metadata = present('1.0.0', registryIntegrity);
      await assert.rejects(
        run(
          {
            publishExit: recovered ? 1 : 0,
            lookups: {
              'vercel@1.0.0': recovered
                ? [{ status: 404 }, metadata]
                : [metadata],
            },
          },
          onlyCli
        ),
        error => {
          assert.match(error.stderr, /on npm with different bytes/);
          return true;
        }
      );
      assert.equal(await readFile(file, 'utf8'), 'stale\n');
      await assert.rejects(readFile(join(root, 'github-env')), {
        code: 'ENOENT',
      });
    });
  });
}

test('successful CLI publish records saved integrity without reading latest', async () => {
  await fixture(async ({ run, calls, root }) => {
    await run(
      { lookups: { 'vercel@latest': [present('0.9.0', registryIntegrity)] } },
      onlyCli
    );
    assert.deepEqual(
      (await calls()).map(call => call.tool),
      ['curl', 'npm']
    );
    assert.equal(
      await readFile(join(root, '.vercel-cli-publish-integrity'), 'utf8'),
      `sha512-${integrity}\n`
    );
    assert.equal(
      await readFile(join(root, 'github-env'), 'utf8'),
      `VERCEL_CLI_PUBLISH_INTEGRITY=sha512-${integrity}\n`
    );
  });
});

for (const response of [
  { status: 401 },
  { status: 403 },
  { status: 429 },
  { status: 500 },
  { status: 302 },
  { status: 0, exitCode: 7 },
  { status: 404, exitCode: 22 },
  { status: 200, raw: 'not JSON' },
  present('9.9.9'),
]) {
  test(`lookup failure never means absent: ${JSON.stringify(response)}`, async () => {
    await fixture(async ({ run, calls }) => {
      await assert.rejects(
        run({ lookups: { 'vercel@1.0.0': [response] } }, onlyCli),
        error => {
          assert.notEqual(error.code, 0);
          assert.match(
            error.stderr,
            /Registry lookup failed|Invalid registry metadata/
          );
          return true;
        }
      );
      assert.equal((await calls()).length, 1);
    });
  });
}

for (const response of [
  { status: 503 },
  { status: 0, exitCode: 7 },
  present('not-semver', undefined, '@vercel/node'),
  present('', undefined, '@vercel/node'),
]) {
  test(`latest lookup fails closed: ${JSON.stringify(response)}`, async () => {
    await fixture(async ({ run, calls }) => {
      await assert.rejects(
        run({ lookups: { '@vercel/node@latest': [response] } }, notCli)
      );
      assert.ok((await calls()).every(call => call.tool === 'curl'));
    });
  });
}

for (const [candidate, latest, tag] of [
  ['1.0.0', '2.0.0', `release-${sha}`],
  ['1.0.0', '1.0.0', 'latest'],
  ['10.0.0', '9.0.0', 'latest'],
  ['1.10.0', '1.9.0', 'latest'],
  ['1.0.0', '1.0.0-rc.1', 'latest'],
  ['1.0.0+candidate', '1.0.0+latest', 'latest'],
  ['1.0.0-rc.1', '0.9.0', 'canary'],
  ['2.0.0-beta.1+build', '1.0.0', 'canary'],
]) {
  test(`non-CLI ${candidate} with latest ${latest} uses ${tag}`, async () => {
    await fixture(async ({ manifest, run, calls }) => {
      manifest.packages[0].version = candidate;
      await run(
        {
          lookups: {
            '@vercel/node@latest': [present(latest, undefined, '@vercel/node')],
          },
        },
        notCli
      );
      const [publish] = (await calls()).filter(call => call.tool === 'npm');
      assert.equal(publish.args.at(-1), tag);
    });
  });
}

for (const version of ['1.0.0', '2.0.0-beta.1']) {
  test(`vercel ${version} waits on canary without reading latest`, async () => {
    await fixture(async ({ manifest, run, calls }) => {
      manifest.packages[1].version = version;
      await run({}, onlyCli);
      const all = await calls();
      assert.ok(!all.some(call => call.args.at(-1)?.endsWith('/latest')));
      const [publish] = all.filter(call => call.tool === 'npm');
      assert.equal(publish.args.at(-1), 'canary');
    });
  });
}

for (const registry of ['sha512-saved-node', 'sha512-other-node']) {
  test(`existing non-CLI version is skipped without comparing bytes (${registry})`, async () => {
    await fixture(async ({ manifest, run, calls }) => {
      manifest.packages[0].integrity = 'sha512-saved-node';
      const lookups = {
        '@vercel/node@1.0.0': [
          {
            status: 200,
            body: {
              name: '@vercel/node',
              version: '1.0.0',
              dist: { integrity: registry },
            },
          },
        ],
      };
      assert.match(
        (await run({ lookups }, notCli)).stdout,
        /already published/
      );
      assert.ok(!(await calls()).some(call => call.tool === 'npm'));
    });
  });
}

for (const recovered of [false, true]) {
  test(`non-CLI ${recovered ? 'recovery' : 'skip'} needs no registry integrity`, async () => {
    await fixture(async ({ run, calls, root }) => {
      const metadata = {
        status: 200,
        body: { name: '@vercel/node', version: '1.0.0' },
      };
      await run(
        {
          publishExit: recovered ? 1 : 0,
          lookups: {
            '@vercel/node@1.0.0': recovered
              ? [{ status: 404 }, metadata]
              : [metadata],
          },
        },
        { NPM_PUBLISH_EXCLUDE: 'vercel' }
      );
      assert.deepEqual(
        (await calls()).map(call => call.tool),
        recovered ? ['curl', 'curl', 'npm', 'curl'] : ['curl']
      );
      await assert.rejects(
        readFile(join(root, '.vercel-cli-publish-integrity')),
        { code: 'ENOENT' }
      );
      await assert.rejects(readFile(join(root, 'github-env')), {
        code: 'ENOENT',
      });
    });
  });
}

for (const response of [
  { status: 404 },
  { status: 503 },
  { status: 0, exitCode: 7 },
]) {
  test(`failed publish does not retry after readback ${JSON.stringify(response)}`, async () => {
    await fixture(async ({ run, calls, root }) => {
      await assert.rejects(
        run(
          {
            publishExit: 1,
            lookups: {
              'vercel@1.0.0': [{ status: 404 }, response],
            },
          },
          onlyCli
        ),
        error => {
          assert.match(error.stderr, /exact version could not be confirmed/);
          return true;
        }
      );
      assert.deepEqual(
        (await calls()).map(call => call.tool),
        ['curl', 'npm', 'curl']
      );
      await assert.rejects(
        readFile(join(root, '.vercel-cli-publish-integrity')),
        { code: 'ENOENT' }
      );
    });
  });
}

test('empty inventory performs no registry operations', async () => {
  await fixture(async ({ manifest, run, calls }) => {
    manifest.packages = [];
    assert.match((await run()).stdout, /No publishable packages/);
    assert.deepEqual(await calls(), []);
  });
});

test('requires a saved directory instead of falling back to the workspace', async () => {
  await fixture(async ({ run, calls }) => {
    await assert.rejects(run({}, {}, []), { code: 2 });
    assert.deepEqual(await calls(), []);
  });
});

for (const [label, mutate] of [
  [
    'source ref',
    m => {
      m.sourceSha = 'main';
    },
  ],
  [
    'duplicate row',
    m => {
      m.packages.push(m.packages[0]);
    },
  ],
  [
    'escaped tarball',
    m => {
      m.packages[0].tarball = '../node.tgz';
    },
  ],
  [
    'missing tarball',
    m => {
      m.packages[1].tarball = 'missing.tgz';
    },
  ],
  [
    'missing CLI integrity',
    m => {
      delete m.packages[1].integrity;
    },
  ],
]) {
  test(`rejects ${label} before registry operations`, async () => {
    await fixture(async ({ manifest, run, calls }) => {
      mutate(manifest);
      await assert.rejects(run());
      assert.deepEqual(await calls(), []);
    });
  });
}
