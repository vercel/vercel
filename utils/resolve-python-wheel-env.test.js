const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
// Use the repo's Vitest globals in CI, or Node's runner without dependencies.
const test = globalThis.test || require('node:test').test;
const {
  resolvePythonWheelEnv,
  validateDeploymentUrl,
  validatePackage,
  validateWheelMetadata,
} = require('./resolve-python-wheel-env');

const deploymentUrl = 'https://preview.example.test';
const packages = [
  { packageDir: 'vercel-runtime', packageName: 'vercel-runtime' },
  { packageDir: 'vercel-workers', packageName: 'vercel-workers' },
];
const filename = 'vercel_runtime-1.2.3-py3-none-any.whl';
const existing = 'EXISTING=value\n';

function withEnvFile(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wheel-env-'));
  const envFile = path.join(dir, 'github-env');
  writeFileSync(envFile, existing);
  return Promise.resolve()
    .then(() => fn(envFile))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}

function metadataResponse(value = { filename }) {
  return new Response(JSON.stringify(value), { status: 200 });
}

test('appends exact specs only after all metadata has been validated', () =>
  withEnvFile(async envFile => {
    const calls = [];
    await resolvePythonWheelEnv({
      packages,
      deploymentUrl: `${deploymentUrl}/`,
      envFile,
      fetchImpl: async (url, options) => {
        assert.equal(readFileSync(envFile, 'utf8'), existing);
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal instanceof AbortSignal);
        calls.push(url);
        return metadataResponse();
      },
    });
    assert.deepEqual(
      calls,
      packages.map(
        pkg => `${deploymentUrl}/tarballs/${pkg.packageDir}-wheel.json`
      )
    );
    assert.equal(
      readFileSync(envFile, 'utf8'),
      existing +
        `VERCEL_RUNTIME_PYTHON=vercel-runtime @ ${deploymentUrl}/tarballs/${filename}\n` +
        `VERCEL_WORKERS_PYTHON=vercel-workers @ ${deploymentUrl}/tarballs/${filename}\n`
    );
  }));

for (const value of [
  undefined,
  null,
  123,
  true,
  {},
  [],
  '',
  'null',
  'wheel.tgz',
  '.hidden.whl',
  '../wheel.whl',
  'foo/../../wheel.whl',
  '/tmp/wheel.whl',
  'foo\\wheel.whl',
  'foo..bar.whl',
  'foo%2fbar.whl',
  'foo%0abar.whl',
  `${filename}\nINJECTED=value`,
  `${filename}\n`,
  `${filename}\r`,
  `${filename}\r\n`,
  `${filename}\u2028`,
  'foo\0bar.whl',
  'foo\tbar.whl',
  'foo bar.whl',
  '$(id).whl',
  '`id`.whl',
  'foo;id.whl',
  'foo&bar.whl',
  'foo|bar.whl',
  'foo>bar.whl',
  'foo<bar.whl',
  'foo"bar.whl',
  "foo'bar.whl",
  'foo*.whl',
  'foo?.whl',
  'foo#bar.whl',
]) {
  test(`rejects unsafe wheel filename ${JSON.stringify(value)}`, () => {
    assert.throws(() => validateWheelMetadata({ filename: value }));
  });
}

for (const value of [null, [], 'filename', 123, {}, { filename: null }]) {
  test(`rejects malformed metadata shape ${JSON.stringify(value)}`, () => {
    assert.throws(() => validateWheelMetadata(value));
  });
}

test('accepts normal wheel tags, build tags and local versions', () => {
  for (const value of [
    filename,
    'vercel_runtime-0.0.0+abc123-py2.py3-none-any.whl',
    'vercel_workers-1.0.0-1-cp312-cp312-manylinux_2_17_x86_64.whl',
    'vercel_workers-1.0rc1-cp313-cp313-macosx_11_0_arm64.whl',
  ]) {
    assert.equal(validateWheelMetadata({ filename: value }), value);
  }
});

for (const value of [
  undefined,
  null,
  123,
  '',
  'http://preview.example.test',
  '//preview.example.test',
  '-https://preview.example.test',
  'https://user:password@preview.example.test',
  'https://preview.example.test/path',
  'https://preview.example.test/../',
  'https://preview.example.test//',
  'https://preview.example.test?query=value',
  'https://preview.example.test#fragment',
  'https://preview.example.test/%0aINJECTED=value',
  'https://preview.example.test\\evil',
  'https://preview.example.test:99999',
  'https://bad..example.test',
  'https://-bad.example.test',
  `${deploymentUrl}\n`,
  `${deploymentUrl}\r\nINJECTED=value`,
  `${deploymentUrl}\t`,
  `${deploymentUrl}\u2028`,
  `${deploymentUrl};id`,
  'https://$(id).example.test',
]) {
  test(`rejects unsafe deployment URL ${JSON.stringify(value)}`, () => {
    assert.throws(() => validateDeploymentUrl(value));
  });
}

test('accepts preview and custom HTTPS origins without assuming a domain', () => {
  assert.equal(validateDeploymentUrl(`${deploymentUrl}/`), deploymentUrl);
  assert.equal(validateDeploymentUrl(deploymentUrl), deploymentUrl);
  assert.equal(
    validateDeploymentUrl('https://custom.example.test:8443/'),
    'https://custom.example.test:8443'
  );
});

for (const key of ['packageDir', 'packageName']) {
  for (const value of [
    undefined,
    null,
    123,
    {},
    '',
    '../escape',
    '..',
    'a..b',
    'a/b',
    'a\\b',
    'a%2fb',
    'a b',
    'a\nb',
    'a\r',
    'a\n',
    'a\u2028',
    'a;id',
    '$(id)',
    'a=b',
  ]) {
    test(`rejects unsafe ${key} ${JSON.stringify(value)}`, () => {
      assert.throws(() => validatePackage({ ...packages[0], [key]: value }));
    });
  }
}

test('validates derived env names and retains existing normalization', () => {
  assert.equal(
    validatePackage({
      packageDir: 'runtime',
      packageName: 'Vercel.Runtime-test',
    }).envName,
    'VERCEL_RUNTIME_TEST_PYTHON'
  );
  assert.throws(() =>
    validatePackage({ packageDir: 'runtime', packageName: '123-runtime' })
  );
});

for (const [label, response] of [
  ['invalid JSON', () => new Response('{')],
  ['empty body', () => new Response('')],
  ['empty success', () => new Response(null, { status: 204 })],
  ['missing filename', () => metadataResponse({})],
  ['non-string filename', () => metadataResponse({ filename: 123 })],
  ['multiline filename', () => metadataResponse({ filename: `${filename}\n` })],
  ['HTTP 500', () => new Response('', { status: 500 })],
  ['HTTP 403', () => new Response('', { status: 403 })],
  ['redirect', () => new Response('', { status: 302 })],
  ['network failure', () => Promise.reject(new Error('network failure'))],
]) {
  test(`${label} after a valid wheel leaves GITHUB_ENV untouched`, () =>
    withEnvFile(async envFile => {
      let requests = 0;
      await assert.rejects(
        resolvePythonWheelEnv({
          packages,
          deploymentUrl,
          envFile,
          fetchImpl: async () =>
            ++requests === 1 ? metadataResponse() : response(),
        })
      );
      assert.equal(requests, 2);
      assert.equal(readFileSync(envFile, 'utf8'), existing);
    }));
}

test('404 skips a missing wheel but keeps other wheels', () =>
  withEnvFile(async envFile => {
    let requests = 0;
    await resolvePythonWheelEnv({
      packages,
      deploymentUrl,
      envFile,
      fetchImpl: async () =>
        ++requests === 1
          ? new Response('not JSON', { status: 404 })
          : metadataResponse(),
    });
    assert.equal(requests, 2);
    assert.equal(
      readFileSync(envFile, 'utf8'),
      existing +
        `VERCEL_WORKERS_PYTHON=vercel-workers @ ${deploymentUrl}/tarballs/${filename}\n`
    );
  }));

test('no packages or all missing wheels leaves GITHUB_ENV unchanged', () =>
  withEnvFile(async envFile => {
    for (const discovered of [[], packages]) {
      await resolvePythonWheelEnv({
        packages: discovered,
        deploymentUrl,
        envFile,
        fetchImpl: async () => new Response(null, { status: 404 }),
      });
      assert.equal(readFileSync(envFile, 'utf8'), existing);
    }
  }));

for (const overrides of [
  { packages: null },
  { packages: [packages[0], null] },
  { packages: [packages[0], { ...packages[1], packageDir: '../escape' }] },
  {
    packages: [packages[0], { ...packages[1], packageName: 'VERCEL.RUNTIME' }],
  },
  { deploymentUrl: `${deploymentUrl}\nINJECTED=value` },
  { envFile: undefined },
]) {
  test(`validates inputs before fetching or writing: ${JSON.stringify(overrides)}`, () =>
    withEnvFile(async envFile => {
      let requests = 0;
      await assert.rejects(
        resolvePythonWheelEnv({
          packages,
          deploymentUrl,
          envFile,
          fetchImpl: async () => {
            requests++;
            return metadataResponse();
          },
          ...overrides,
        })
      );
      assert.equal(requests, 0);
      assert.equal(readFileSync(envFile, 'utf8'), existing);
    }));
}

test('CLI fails closed with no env writes or untrusted diagnostics', () =>
  withEnvFile(async envFile => {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'resolve-python-wheel-env.js')],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DPL_URL: `${deploymentUrl}\n::error::injected`,
          GITHUB_ENV: envFile,
        },
      }
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(
      result.stderr,
      'Python wheel URL resolution failed validation or fetch.\n'
    );
    assert.equal(readFileSync(envFile, 'utf8'), existing);
  }));

test('E2E jobs load the wheel resolver from the trusted base commit', () => {
  const workflow = readFileSync(
    path.join(__dirname, '../.github/workflows/test.yml'),
    'utf8'
  );

  assert.match(
    workflow,
    /BASE_SHA: \$\{\{ needs\.setup\.outputs\.baseSha \}\}/
  );
  assert.match(
    workflow,
    /git show "\$\{BASE_SHA\}:utils\/get-python-packages\.js"/
  );
  assert.match(
    workflow,
    /git show "\$\{BASE_SHA\}:utils\/resolve-python-wheel-env\.js"/
  );
  assert.match(
    workflow,
    /packages: getPythonPackages\(process\.env\.GITHUB_WORKSPACE\)/
  );
  assert.doesNotMatch(
    workflow,
    /run: node utils\/resolve-python-wheel-env\.js/
  );
});
