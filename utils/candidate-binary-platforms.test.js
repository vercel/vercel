// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal workflow contracts, not JS interpolation.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = globalThis.test || require('node:test').test;

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const candidate = read('.github/workflows/candidate-binaries.yml');
const release = read('.github/workflows/native-binaries.yml');
const muslScript = read('packages/cli/scripts/build-binary-musl.sh');

// Bounded to the named job's matrix; no installed YAML parser is needed.
function matrixRows(source, job) {
  const header = `\n  ${job}:\n`;
  assert.equal(source.split(header).length, 2, `Exactly one ${job} job`);
  const body = source.split(header)[1].split(/\n {2}[\w-]+:\n/)[0];
  return [
    ...body.matchAll(/^ {10}- (?:runner|runs-on): (.+)\n((?: {12}.*\n)*)/gm),
  ].map(([, runner, fields]) => ({
    runner,
    ...Object.fromEntries(
      [...fields.matchAll(/^ {12}([\w-]+): (.*)$/gm)].map(([, key, value]) => [
        key,
        value.replace(/^'(.*)'$/, '$1'),
      ])
    ),
  }));
}

const rows = matrixRows(candidate, 'build');
const starts = [...candidate.matchAll(/^ {6}- /gm)].map(match => match.index);
const steps = starts.map((start, index) =>
  candidate.slice(start, starts[index + 1] ?? candidate.length)
);
function step(name) {
  const matches = steps.filter(text =>
    text.startsWith(`      - name: ${name}\n`)
  );
  assert.equal(matches.length, 1, `Exactly one step named ${name}`);
  return matches[0];
}

function field(source, key, indent = 8) {
  const prefix = `${' '.repeat(indent)}${key}: `;
  const matches = source.split('\n').filter(line => line.startsWith(prefix));
  assert.equal(matches.length, 1, `Exactly one ${prefix}`);
  return matches[0].slice(prefix.length);
}

test('candidate matrix covers all eight release assets on matching native runners', () => {
  const expected = [
    ['macos-arm64', 'vercel-darwin-arm64', 'macos-15-xlarge', null],
    ['macos-x64', 'vercel-darwin-x64', 'macos-15-large', null],
    ['linux-arm64', 'vercel-linux-arm64', 'ubuntu-latest-32-core-arm', 'glibc'],
    ['linux-x64', 'vercel-linux-x64', 'ubuntu-latest-32-core', 'glibc'],
    [
      'linux-arm64',
      'vercel-linux-arm64-musl',
      'ubuntu-latest-32-core-arm',
      'musl',
    ],
    ['linux-x64', 'vercel-linux-x64-musl', 'ubuntu-latest-32-core', 'musl'],
    ['win-arm64', 'vercel-windows-arm64', 'windows-11-arm', null],
    ['win-x64', 'vercel-windows-x64', 'windows-2022', null],
  ].map(([platform, asset, runner, libc]) => ({
    target: `node24.22.1-${platform}`,
    architecture: platform.split('-')[1],
    asset,
    runner,
    ext: platform.startsWith('win-') ? '.exe' : '',
    libc,
  }));
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map(row => row.asset)).size, 8);
  assert.deepEqual(
    rows.map(({ target, architecture, asset, runner, ext, libc }) => ({
      target,
      architecture,
      asset,
      runner,
      ext,
      libc: libc ?? null,
    })),
    expected
  );
  // Each binary is smoke-tested where it is built; the final-binary workflow only
  // runs native Builder checks on both Linux architectures.
  assert.doesNotMatch(release, /^ {2}smoke:$/m);
  assert.deepEqual(
    matrixRows(release, 'native-builder-check')
      .map(({ arch }) => arch)
      .sort(),
    ['arm64', 'x64']
  );
});

test('all platforms retain native setup and Windows toolchain workarounds', () => {
  assert.equal(rows.filter(row => row.architecture === 'arm64').length, 4);
  assert.equal(rows.filter(row => row.architecture === 'x64').length, 4);
  assert.match(candidate, /architecture: \$\{\{ matrix.architecture \}\}/);
  assert.match(candidate, /node-version: 24\.22\.1/);
  assert.equal(
    rows.find(row => row.asset === 'vercel-windows-arm64')['install-args'],
    '--ignore-scripts'
  );
  assert.match(
    candidate,
    /pnpm install --frozen-lockfile \$\{\{ matrix.install-args \}\}/
  );
  assert.match(candidate, /GO_BIN=\$goBin/);
});

test('only musl uses the existing Alpine build and smoke script', () => {
  const host = step('Build binary');
  const musl = step('Build and smoke test musl binary in Alpine');
  assert.equal(field(host, 'if'), "matrix.libc != 'musl'");
  assert.equal(field(host, 'working-directory'), 'packages/cli');
  assert.equal(
    field(host, 'run'),
    'node scripts/build-binary.mjs --target ${{ matrix.target }} --output ./dist-bin/${{ matrix.asset }}${{ matrix.ext }}'
  );
  assert.equal(field(musl, 'if'), "matrix.libc == 'musl'");
  assert.equal(field(musl, 'shell'), 'bash');
  assert.equal(field(musl, 'working-directory'), 'packages/cli');
  assert.equal(
    field(musl, 'run'),
    'bash scripts/build-binary-musl.sh ${{ matrix.architecture }} ./dist-bin/${{ matrix.asset }}${{ matrix.ext }}'
  );
  assert.match(muslScript, /^node_version=24\.22\.1$/m);
  assert.match(muslScript, /image="node:\$node_version-alpine/);
  assert.match(muslScript, /docker run --rm/);
  assert.match(muslScript, /TARGET=node\$node_version-linux-\$arch/);
  assert.match(muslScript, /node scripts\/smoke-test-binary\.mjs "\$OUTPUT"/);
  for (const build of [host, musl]) {
    assert.ok(
      steps.indexOf(step('Build workspace packages')) < steps.indexOf(build)
    );
    assert.ok(
      steps.indexOf(build) <
        steps.indexOf(step('Archive binary with checksum and build metadata'))
    );
  }
});

test('musl never runs host glibc checks or host smoke tests', () => {
  const glibc = step('Check Linux glibc ceiling');
  const smoke = step('Smoke test unsigned binary');
  assert.equal(
    field(glibc, 'if'),
    "runner.os == 'Linux' && matrix.libc != 'musl'"
  );
  assert.match(
    field(glibc, 'run'),
    /scripts\/check-binary-glibc\.mjs .* 2\.28$/
  );
  assert.equal(field(smoke, 'if'), "matrix.libc != 'musl'");
  assert.match(smoke, /node scripts\/smoke-test-binary\.mjs "\$BINARY"/);
  assert.ok(steps.indexOf(glibc) < steps.indexOf(smoke));
  assert.ok(
    steps.indexOf(smoke) <
      steps.indexOf(step('Archive binary with checksum and build metadata'))
  );
  assert.doesNotMatch(candidate, /continue-on-error:/);
});

test('every row archives its libc with the exact target and preserves asset names', () => {
  const archive = step('Archive binary with checksum and build metadata');
  const upload = step('Upload candidate artifact');
  assert.equal(field(archive, 'LIBC', 10), '${{ matrix.libc }}');
  assert.equal(field(archive, 'TARGET', 10), '${{ matrix.target }}');
  assert.equal(field(archive, 'SOURCE_SHA', 10), '${{ inputs.ref }}');
  assert.equal(
    field(archive, 'BINARY', 10),
    'packages/cli/dist-bin/${{ matrix.asset }}${{ matrix.ext }}'
  );
  assert.equal(
    field(archive, 'run'),
    'node utils/archive-candidate-binary.mjs "$BINARY" "$TARGET" "$SOURCE_SHA" "$RUNNER_TEMP" "$LIBC"'
  );
  assert.equal(
    field(upload, 'path', 10),
    '${{ runner.temp }}/${{ matrix.asset }}${{ matrix.ext }}.tar.gz'
  );
  assert.equal(
    field(upload, 'name', 10),
    'candidate-binary-${{ inputs.ref }}-${{ matrix.asset }}-attempt-${{ github.run_attempt }}'
  );
  assert.doesNotMatch(archive + upload, /^ {8}if:/m);
  assert.ok(steps.indexOf(archive) < steps.indexOf(upload));
});
