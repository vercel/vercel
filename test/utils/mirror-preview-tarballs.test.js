const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { once } = require('node:events');
const {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} = require('node:fs/promises');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');
const test = globalThis.test || require('node:test').test;
const {
  deploymentTarballPath,
  findDeploymentOrigin,
  mirrorPreviewTarballs,
} = require('../../utils/mirror-preview-tarballs');

const exec = promisify(execFile);
const mirrorOrigin = 'http://127.0.0.1:4873';
const loopbackPattern = /^http:\/\/127\.0\.0\.1:\d+(?=\/tarballs\/)/;

async function withTemp(fn) {
  const root = await mkdtemp(join(tmpdir(), 'mirror-preview-test-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function packTarball(root, file, manifest, extraFiles = {}) {
  const directory = await mkdtemp(join(root, 'pack-'));
  await mkdir(join(directory, 'package'), { recursive: true });
  await writeFile(
    join(directory, 'package/package.json'),
    JSON.stringify(manifest)
  );
  for (const [name, { content, mode }] of Object.entries(extraFiles)) {
    await writeFile(join(directory, 'package', name), content, { mode });
  }
  await mkdir(join(file, '..'), { recursive: true });
  await exec('tar', ['-czf', file, '-C', directory, 'package']);
  await rm(directory, { recursive: true, force: true });
  return file;
}

async function readManifest(tarball) {
  const { stdout } = await exec('tar', [
    '-xzOf',
    tarball,
    'package/package.json',
  ]);
  return JSON.parse(stdout);
}

// A fake preview deployment serving files from <root>/deployment/tarballs.
async function withDeployment(root, fn) {
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push(req.url);
    const name = req.url.replace(/^\/tarballs\//, '');
    try {
      const body = await readFile(join(root, 'deployment/tarballs', name));
      res.writeHead(200).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    return await fn({ origin, requests });
  } finally {
    server.close();
  }
}

function mirror(root, tarball) {
  return mirrorPreviewTarballs({
    tarball,
    out: join(root, 'mirror'),
    origin: `${mirrorOrigin}/`,
    deploymentOriginPattern: loopbackPattern,
    log: () => {},
  });
}

test('finds exactly one preview deployment origin', () => {
  assert.equal(
    findDeploymentOrigin({
      dependencies: {
        semver: '7.0.0',
        '@vercel/node': 'https://vercel-abc.vercel.sh/tarballs/vercel-node.tgz',
      },
      builders: {
        '@vercel/go': 'https://vercel-abc.vercel.sh/tarballs/vercel-go.tgz',
      },
    }),
    'https://vercel-abc.vercel.sh'
  );
  assert.throws(
    () => findDeploymentOrigin({ dependencies: { semver: '7.0.0' } }),
    /exactly one preview deployment origin in the CLI manifest, found 0/
  );
  assert.throws(
    () =>
      findDeploymentOrigin({
        dependencies: {
          a: 'https://vercel-a.vercel.sh/tarballs/a.tgz',
          b: 'https://vercel-b.vercel.sh/tarballs/b.tgz',
        },
      }),
    /found 2/
  );
});

test('rejects tarball paths that escape /tarballs/', () => {
  const origin = 'https://vercel-abc.vercel.sh';
  assert.equal(
    deploymentTarballPath(`${origin}/tarballs/@vercel/node.tgz`, origin),
    '@vercel/node.tgz'
  );
  assert.equal(deploymentTarballPath('7.0.0', origin), undefined);
  for (const path of ['../x.tgz', 'a/../../x.tgz', 'a//b.tgz', 'x.tgz?y=1']) {
    assert.throws(
      () => deploymentTarballPath(`${origin}/tarballs/${path}`, origin),
      /Refusing to mirror/
    );
  }
});

test('mirrors the install graph from a deployment and rewrites every manifest', async () => {
  await withTemp(async root => {
    await withDeployment(root, async ({ origin: from, requests }) => {
      const tarballs = join(root, 'deployment/tarballs');
      await packTarball(root, join(tarballs, 'dep-a.tgz'), {
        name: 'dep-a',
        version: '1.0.0',
        dependencies: { 'dep-c': `${from}/tarballs/dep-c.tgz`, ms: '2.1.2' },
      });
      await packTarball(root, join(tarballs, '@scope/dep-b.tgz'), {
        name: '@scope/dep-b',
        version: '1.0.0',
      });
      await packTarball(root, join(tarballs, 'dep-c.tgz'), {
        name: 'dep-c',
        version: '1.0.0',
        // A cycle back to an already queued tarball must not refetch it.
        dependencies: { 'dep-a': `${from}/tarballs/dep-a.tgz` },
      });
      const cli = await packTarball(
        root,
        join(root, 'input/vercel.tgz'),
        {
          name: 'vercel',
          version: '1.0.0',
          homepage: 'https://docs.example/tarballs/vercel',
          bin: { vercel: 'cli.js' },
          dependencies: {
            'dep-a': `${from}/tarballs/dep-a.tgz`,
            semver: '7.0.0',
          },
          // Not deployed, never installed: rewritten but not fetched.
          devDependencies: { internal: `${from}/tarballs/internal.tgz` },
          builders: { '@scope/dep-b': `${from}/tarballs/@scope/dep-b.tgz` },
        },
        { 'cli.js': { content: '#!/usr/bin/env node\n', mode: 0o755 } }
      );

      const result = await mirror(root, cli);

      const out = join(root, 'mirror');
      assert.deepEqual(result, {
        deploymentOrigin: from,
        fetched: 3,
        tarball: join(out, 'tarballs/vercel.tgz'),
      });
      assert.deepEqual(requests.sort(), [
        '/tarballs/@scope/dep-b.tgz',
        '/tarballs/dep-a.tgz',
        '/tarballs/dep-c.tgz',
      ]);
      assert.deepEqual(await readdir(out), ['tarballs']);
      assert.deepEqual((await readdir(join(out, 'tarballs'))).sort(), [
        '@scope',
        'dep-a.tgz',
        'dep-c.tgz',
        'vercel.tgz',
      ]);

      const cliManifest = await readManifest(result.tarball);
      assert.equal(
        cliManifest.homepage,
        'https://docs.example/tarballs/vercel'
      );
      assert.deepEqual(cliManifest.dependencies, {
        'dep-a': `${mirrorOrigin}/tarballs/dep-a.tgz`,
        semver: '7.0.0',
      });
      assert.deepEqual(cliManifest.devDependencies, {
        internal: `${mirrorOrigin}/tarballs/internal.tgz`,
      });
      assert.deepEqual(cliManifest.builders, {
        '@scope/dep-b': `${mirrorOrigin}/tarballs/@scope/dep-b.tgz`,
      });
      assert.deepEqual(
        (await readManifest(join(out, 'tarballs/dep-a.tgz'))).dependencies,
        { 'dep-c': `${mirrorOrigin}/tarballs/dep-c.tgz`, ms: '2.1.2' }
      );

      const extracted = join(root, 'extracted');
      await mkdir(extracted);
      await exec('tar', ['-xzpf', result.tarball, '-C', extracted]);
      const { mode } = await stat(join(extracted, 'package/cli.js'));
      assert.equal(mode & 0o111, 0o111);
    });
  });
});

test('fails when a mirrored manifest still references another deployment', async () => {
  await withTemp(async root => {
    await withDeployment(root, async ({ origin: from }) => {
      await packTarball(root, join(root, 'deployment/tarballs/dep-a.tgz'), {
        name: 'dep-a',
        version: '1.0.0',
        dependencies: {
          stale: 'https://vercel-old.vercel.sh/tarballs/stale.tgz',
        },
      });
      const cli = await packTarball(root, join(root, 'vercel.tgz'), {
        name: 'vercel',
        version: '1.0.0',
        dependencies: { 'dep-a': `${from}/tarballs/dep-a.tgz` },
      });
      await assert.rejects(
        mirror(root, cli),
        /dep-a\.tgz still references .*: https:\/\/vercel-old\.vercel\.sh\/tarballs\/stale\.tgz/
      );
    });
  });
});

test('fails when a deployment tarball is missing', async () => {
  await withTemp(async root => {
    await withDeployment(root, async ({ origin: from }) => {
      const cli = await packTarball(root, join(root, 'vercel.tgz'), {
        name: 'vercel',
        version: '1.0.0',
        dependencies: { gone: `${from}/tarballs/gone.tgz` },
      });
      await assert.rejects(mirror(root, cli), /gone\.tgz returned 404/);
    });
  });
});
