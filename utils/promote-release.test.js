const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./promote-release.mjs');
const sha = 'a'.repeat(40);
const integrity = `sha512-${'A'.repeat(86)}==`;

function fixture({ packages, registry, latest }) {
  const directory = mkdtempSync(join(tmpdir(), 'promote-release-'));
  mkdirSync(join(directory, 'npm'));
  mkdirSync(join(directory, 'native'));
  writeFileSync(
    join(directory, 'npm/manifest.json'),
    JSON.stringify({ sourceSha: sha, packages, tags: [], releases: [] })
  );
  const calls = [];
  const run = (tool, args) => {
    calls.push([tool, ...args]);
    if (tool !== 'npm') throw new Error(`Unexpected ${tool}`);
    const [action, spec, value] = args;
    if (action === 'dist-tag') {
      const target = args[2];
      assert.deepEqual([spec, args[3]], ['add', 'latest']);
      latest[target.slice(0, target.lastIndexOf('@'))] = target.slice(
        target.lastIndexOf('@') + 1
      );
      return '';
    }
    assert.equal(action, 'view');
    if (value === 'dist-tags.latest')
      return JSON.stringify(latest[spec] ?? null);
    const published = registry[spec];
    if (!published) return '';
    return JSON.stringify(
      value === 'version' ? published.version : published.integrity
    );
  };
  return { directory, calls, run, latest };
}

const pkgs = (version = '2.0.0') => [
  { name: '@vercel/node', version, tarball: 'node.tgz' },
  { name: 'vercel', version, tarball: 'vercel.tgz', integrity },
];
const published = (version = '2.0.0', cliIntegrity = integrity) => ({
  [`@vercel/node@${version}`]: { version },
  [`vercel@${version}`]: { version, integrity: cliIntegrity },
});

test('promotes only vercel and returns CLI notes data', async () => {
  const { promoteRelease } = await load;
  const f = fixture({
    packages: pkgs(),
    registry: published(),
    latest: { '@vercel/node': '1.0.0', vercel: '1.0.0' },
  });
  try {
    const result = promoteRelease(f.directory, f.run, () => {});
    assert.deepEqual(
      f.calls.filter(call => call[1] === 'dist-tag').map(call => call[3]),
      ['vercel@2.0.0']
    );
    assert.deepEqual(result, { sourceSha: sha, cli: pkgs()[1] });
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test('never moves latest backward, promotes prereleases, or reruns tags', async () => {
  const { promoteRelease } = await load;
  for (const [version, latest] of [
    ['2.0.0', '3.0.0'],
    ['2.0.0', '2.0.0'],
    ['3.0.0-beta.1', '2.0.0'],
  ]) {
    const f = fixture({
      packages: pkgs(version),
      registry: published(version),
      latest: { '@vercel/node': latest, vercel: latest },
    });
    try {
      const result = promoteRelease(f.directory, f.run, () => {});
      assert.ok(!f.calls.some(call => call[1] === 'dist-tag'));
      if (version !== latest) assert.equal(result.cli, null);
    } finally {
      rmSync(f.directory, { recursive: true, force: true });
    }
  }
});

test('stops before any tag change when a package is missing', async () => {
  const { promoteRelease } = await load;
  const registry = published();
  delete registry['vercel@2.0.0'];
  const f = fixture({ packages: pkgs(), registry, latest: {} });
  try {
    assert.throws(
      () => promoteRelease(f.directory, f.run, () => {}),
      /vercel@2.0.0 is not published/
    );
    assert.ok(!f.calls.some(call => call[1] === 'dist-tag'));
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test('refuses to promote when npm has different CLI bytes', async () => {
  const { promoteRelease } = await load;
  const f = fixture({
    packages: pkgs(),
    registry: published('2.0.0', `sha512-${'B'.repeat(86)}==`),
    latest: { vercel: '1.0.0' },
  });
  try {
    assert.throws(
      () => promoteRelease(f.directory, f.run, () => {}),
      /not the saved release tarball/
    );
    assert.ok(!f.calls.some(call => call[1] === 'dist-tag'));
    assert.equal(f.latest.vercel, '1.0.0');
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test('compares SemVer precedence', async () => {
  const { compareVersions } = await load;
  for (const [a, b, expected] of [
    ['10.0.0', '9.0.0', 1],
    ['1.10.0', '1.9.0', 1],
    ['1.0.0', '1.0.0-rc.1', 1],
    ['1.0.0-rc.10', '1.0.0-rc.2', 1],
    ['1.0.0-alpha', '1.0.0-1', 1],
    ['1.0.0+a', '1.0.0+b', 0],
  ]) {
    assert.equal(compareVersions(a, b), expected, `${a} vs ${b}`);
    assert.equal(compareVersions(b, a), -expected || 0, `${b} vs ${a}`);
  }
});
