const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./finalize-release.mjs');
const sha = 'a'.repeat(40);
const version = '1.2.3';
const pkg = name => ({
  name,
  version,
  tarball: `${name.replace(/[@/]/g, '')}.tgz`,
});
const tag = p => `${p.name}@${p.version}`;
const cli = pkg('vercel');
const builder = pkg('@vercel/node');
const privateTags = [
  '@vercel-internals/private-fixture',
  'python-private-fixture',
].map(name => ({ name, version }));
const assets = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
  'windows-arm64.exe',
  'windows-x64.exe',
].flatMap(target => [`vercel-${target}`, `vercel-${target}.sha256`]);
const helper = join(__dirname, 'finalize-release.mjs');

async function fixture(
  check,
  releases = [cli],
  tags = releases.map(({ name, version }) => ({ name, version }))
) {
  const directory = mkdtempSync(join(tmpdir(), 'finalize release '));
  const manifest = {
    sourceSha: sha,
    cliVersion: releases.some(p => p.name === 'vercel') ? version : '',
    packages: [pkg('@vercel/vc-native'), ...releases],
    tags,
    releases,
  };
  mkdirSync(join(directory, 'npm'));
  mkdirSync(join(directory, 'changelogs'));
  writeFileSync(join(directory, 'npm/manifest.json'), JSON.stringify(manifest));
  if (manifest.cliVersion) {
    mkdirSync(join(directory, 'native'));
    for (const asset of assets)
      writeFileSync(join(directory, 'native', asset), asset);
  }
  const s = {
    directory,
    manifest,
    calls: [],
    tags: new Map(),
    annotations: new Map(),
    releases: new Map(),
    latest: version,
  };
  s.saveNotes = (p, text) =>
    writeFileSync(join(directory, 'changelogs', `${p.tarball}.md`), text);
  s.existing = (p, names = []) => {
    s.tags.set(tag(p), { type: 'commit', sha });
    const release = {
      id: s.releases.size + 1,
      tag_name: tag(p),
      body: 'Keep original release body',
      assets: new Map(names.map(name => [name, 'Keep original asset bytes'])),
    };
    s.releases.set(tag(p), release);
    return release;
  };
  s.mutations = () =>
    s.calls.filter(
      ([command, args]) =>
        command === 'gh' && (args[0] === 'release' || args.includes('POST'))
    );
  s.run = (command, args) => {
    s.calls.push([command, args]);
    s.fail?.(command, args);
    if (command === 'npm') {
      assert.deepEqual(args, [
        'view',
        'vercel',
        'dist-tags.latest',
        '--json',
        '--registry=https://registry.npmjs.org',
      ]);
      return JSON.stringify(s.latest);
    }
    assert.equal(
      command,
      'gh',
      'No checkout, build, or candidate code execution'
    );
    if (args[0] === 'api') {
      assert.ok(args[1].startsWith('repos/{owner}/{repo}/'));
      const path = args[1].slice('repos/{owner}/{repo}/'.length);
      if (path === 'git/refs') {
        assert.deepEqual(args.slice(2, 5), ['-X', 'POST', '-f']);
        assert.equal(args[6], '-f');
        assert.equal(args[7], `sha=${sha}`);
        const name = args[5].slice('ref=refs/tags/'.length);
        assert.ok(!s.tags.has(name), 'Never overwrite an existing tag');
        s.tags.set(name, { type: 'commit', sha });
        return '{}';
      }
      assert.equal(args[2], '--method=GET');
      if (path.startsWith('git/matching-refs/tags/')) {
        const prefix = decodeURIComponent(
          path.slice('git/matching-refs/tags/'.length)
        );
        return JSON.stringify(
          [...s.tags]
            .filter(([name]) => name.startsWith(prefix))
            .map(([name, object]) => ({ ref: `refs/tags/${name}`, object }))
        );
      }
      if (path.startsWith('git/tags/')) {
        return JSON.stringify({
          object: s.annotations.get(path.slice('git/tags/'.length)),
        });
      }
      assert.equal(args[3], '--paginate');
      assert.equal(args.length, 5);
      if (path === 'releases?per_page=100') {
        assert.equal(args[4], '--jq=.[] | {id, tag_name} | tojson');
        return [...s.releases.values()]
          .map(({ id, tag_name }) => JSON.stringify({ id, tag_name }))
          .join('\n');
      }
      const release = [...s.releases.values()].find(
        r => path === `releases/${r.id}/assets?per_page=100`
      );
      assert.ok(release, `Unexpected API request: ${path}`);
      assert.equal(args[4], '--jq=.[] | .name | tojson');
      return [...release.assets.keys()]
        .map(name => JSON.stringify(name))
        .join('\n');
    }
    assert.equal(args[0], 'release');
    if (args[1] === 'create') {
      assert.ok(s.tags.has(args[2]));
      assert.ok(!s.releases.has(args[2]));
      assert.deepEqual(args.slice(3, 5), [
        '--verify-tag',
        `--title=${args[2]}`,
      ]);
      assert.ok(args[5].startsWith('--notes='));
      assert.equal(args[6], '--latest=false');
      s.releases.set(args[2], {
        id: s.releases.size + 1,
        tag_name: args[2],
        body: args[5].slice('--notes='.length),
        assets: new Map(),
      });
    } else if (args[1] === 'upload') {
      assert.equal(args[2], tag(cli), 'Only the CLI gets native assets');
      const release = s.releases.get(args[2]);
      for (const file of args.slice(3)) {
        assert.equal(file, join(directory, 'native', basename(file)));
        assert.ok(
          !release.assets.has(basename(file)),
          'Never clobber existing assets'
        );
        release.assets.set(basename(file), readFileSync(file, 'utf8'));
      }
    } else {
      assert.deepEqual(args, ['release', 'edit', tag(cli), '--latest']);
      assert.equal(s.latest, version);
    }
    return '';
  };
  try {
    const { finalizeRelease } = await load;
    s.finalize = () => finalizeRelease(directory, s.run);
    await check(s);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('tags all planned entries at H but creates only public releases, with saved notes and all 16 native files', async () => {
  await fixture(
    s => {
      s.saveNotes(
        builder,
        '# Builder\r\n\r\n## 2.0.0\r\n\r\nNewer\r\n\r\n## 1.2.3\r\n\r\n### Patch Changes\r\n\r\n- Saved notes at H\r\n\r\n## 1.0.0\r\n\r\nOlder\r\n'
      );
      s.finalize();
      assert.deepEqual(
        [...s.tags.keys()],
        [...privateTags.map(tag), tag(builder), tag(cli)]
      );
      assert.deepEqual([...s.releases.keys()], [tag(builder), tag(cli)]);
      assert.equal(
        s.releases.get(tag(builder)).body,
        '### Patch Changes\r\n\r\n- Saved notes at H'
      );
      assert.equal(s.releases.get(tag(cli)).body, `Release ${tag(cli)}.`);
      assert.deepEqual(
        [...s.releases.get(tag(cli)).assets.keys()].sort(),
        [...assets].sort()
      );
      assert.deepEqual(s.calls.at(-1), [
        'gh',
        ['release', 'edit', tag(cli), '--latest'],
      ]);
    },
    [builder, cli],
    [
      ...privateTags,
      ...[builder, cli].map(({ name, version }) => ({ name, version })),
    ]
  );
});

test('private-only bundles create tags at H without GitHub releases or npm calls and retry safely', async () => {
  await fixture(
    s => {
      s.finalize();
      assert.deepEqual(
        [...s.tags],
        privateTags.map(p => [tag(p), { type: 'commit', sha }])
      );
      assert.equal(s.releases.size, 0);
      assert.ok(
        s.calls.every(
          ([command, args]) =>
            command === 'gh' &&
            args[0] === 'api' &&
            args[1].startsWith('repos/{owner}/{repo}/git/')
        )
      );
      s.calls.length = 0;
      s.finalize();
      assert.deepEqual(s.mutations(), []);
      s.tags.set(tag(privateTags[0]), { type: 'commit', sha: 'b'.repeat(40) });
      s.calls.length = 0;
      assert.throws(s.finalize, /refusing to move it/);
      assert.deepEqual(s.mutations(), []);
    },
    [],
    privateTags
  );
});

test('preserves existing bodies, lightweight/annotated tags, and assets across retries', async () => {
  await fixture(s => {
    s.latest = '9.9.9';
    const release = s.existing(cli, [assets[0], assets[1], 'unrelated.txt']);
    const annotation = 'b'.repeat(40);
    s.tags.set(tag(cli), { type: 'tag', sha: annotation });
    s.annotations.set(annotation, { type: 'commit', sha });
    // Existing bodies must not even consult saved notes.
    mkdirSync(join(s.directory, 'changelogs', `${cli.tarball}.md`));
    s.finalize();
    assert.equal(s.mutations().length, 1);
    assert.equal(s.mutations()[0][1][1], 'upload');
    assert.equal(release.body, 'Keep original release body');
    assert.equal(release.assets.get(assets[0]), 'Keep original asset bytes');
    assert.equal(
      release.assets.get('unrelated.txt'),
      'Keep original asset bytes'
    );
    assert.equal(release.assets.size, 17);
    assert.deepEqual(s.tags.get(tag(cli)), { type: 'tag', sha: annotation });
    s.calls.length = 0;
    s.finalize();
    assert.deepEqual(s.mutations(), []);
    s.tags.set(tag(cli), { type: 'commit', sha });
    s.calls.length = 0;
    s.finalize();
    assert.deepEqual(s.mutations(), []);
  });
});

test('promotes an existing CLI release only when npm latest matches, without editing its body', async () => {
  await fixture(s => {
    const release = s.existing(cli, assets);
    s.finalize();
    assert.deepEqual(s.mutations(), [
      ['gh', ['release', 'edit', tag(cli), '--latest']],
    ]);
    assert.equal(release.body, 'Keep original release body');
  });
});

test('creates historical CLI releases with latest=false and never promotes them', async () => {
  await fixture(s => {
    s.latest = '9.9.9';
    s.finalize();
    assert.ok(!s.calls.some(([, args]) => args[1] === 'edit'));
  });
});

for (const annotated of [false, true]) {
  test(`rejects a conflicting ${annotated ? 'annotated' : 'lightweight'} tag without mutations`, async () => {
    await fixture(s => {
      const other = 'b'.repeat(40);
      s.tags.set(tag(cli), { type: annotated ? 'tag' : 'commit', sha: other });
      s.annotations.set(other, { type: 'commit', sha: 'c'.repeat(40) });
      assert.throws(s.finalize, /refusing to move it/);
      assert.deepEqual(s.mutations(), []);
    });
  });
}

test('matches exact scoped tags, not prefixes; non-CLI needs no native directory or npm metadata', async () => {
  await fixture(
    s => {
      s.tags.set(`${tag(builder)}0`, { type: 'commit', sha: 'b'.repeat(40) });
      s.saveNotes(builder, '# Builder\n\n## 1.0.0\n\nNot this version\n');
      s.finalize();
      assert.equal(s.tags.get(tag(builder)).sha, sha);
      assert.equal(
        s.releases.get(tag(builder)).body,
        `Release ${tag(builder)}.`
      );
      assert.equal(s.calls.filter(([command]) => command === 'npm').length, 0);
      assert.ok(
        !s.calls.some(([, args]) => ['edit', 'upload'].includes(args[1]))
      );
    },
    [builder]
  );
});

for (const endpoint of [
  'releases?',
  'git/matching-refs/',
  'git/tags/',
  'releases/1/assets?',
]) {
  for (const message of [
    'HTTP 401',
    'HTTP 403',
    'HTTP 404',
    'HTTP 500',
    'connection reset',
  ]) {
    test(`${endpoint} ${message} fails closed instead of treating it as missing`, async () => {
      await fixture(s => {
        s.existing(cli);
        if (endpoint === 'git/tags/')
          s.tags.set(tag(cli), { type: 'tag', sha });
        const failure = new Error(message);
        s.fail = (command, args) => {
          if (
            command === 'gh' &&
            args[0] === 'api' &&
            args[1].includes(endpoint)
          )
            throw failure;
        };
        assert.throws(s.finalize, error => error === failure);
        assert.deepEqual(s.mutations(), []);
      });
    });
  }
}

test('npm metadata failures propagate and cannot promote an existing release', async () => {
  await fixture(s => {
    s.existing(cli, assets);
    s.fail = command => {
      if (command === 'npm') throw new Error('npm unavailable');
    };
    assert.throws(s.finalize, /npm unavailable/);
    assert.deepEqual(s.mutations(), []);
  });
});

test('missing native inputs fail rather than silently completing', async () => {
  await fixture(s => {
    s.existing(cli);
    rmSync(join(s.directory, 'native'), { recursive: true });
    assert.throws(s.finalize, { code: 'ENOENT' });
    assert.deepEqual(s.mutations(), []);
  });
});

test('non-missing changelog read errors propagate instead of generating fallback notes', async () => {
  await fixture(
    s => {
      s.tags.set(tag(builder), { type: 'commit', sha });
      mkdirSync(join(s.directory, 'changelogs', `${builder.tarball}.md`));
      assert.throws(s.finalize, { code: 'EISDIR' });
      assert.deepEqual(s.mutations(), []);
    },
    [builder]
  );
});

test('CLI entrypoint uses argv[2], fake commands only, and exits nonzero on failure', async () => {
  await fixture(s => {
    const preload = join(s.directory, 'fake-commands.cjs');
    const log = join(s.directory, 'commands.jsonl');
    writeFileSync(
      preload,
      `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const childProcess = require('node:child_process');
childProcess.execFileSync = (name, args) => {
  assert.ok(name === 'gh' || name === 'npm', 'Unexpected subprocess');
  fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify([name, args]) + '\\n');
  if (process.env.FAIL_COMMAND) throw new Error('HTTP 401');
  if (name === 'npm') return JSON.stringify('${version}');
  if (args[0] === 'api') return args.includes('--paginate') ? '' : args.includes('POST') ? '{}' : '[]';
  return '';
};
require('node:module').syncBuiltinESMExports();
`
    );
    const options = {
      cwd: s.directory,
      env: { ...process.env, COMMAND_LOG: log, FAIL_COMMAND: '' },
      encoding: 'utf8',
    };
    const cliArgs = ['--require', preload, helper];
    execFileSync(process.execPath, [...cliArgs, s.directory], options);
    const calls = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.ok(
      calls.some(([name, args]) => name === 'gh' && args[1] === 'create')
    );
    assert.ok(
      calls.some(
        ([name, args]) =>
          name === 'gh' && args[1] === 'upload' && args.length === 19
      )
    );
    assert.deepEqual(calls.at(-1), [
      'gh',
      ['release', 'edit', tag(cli), '--latest'],
    ]);
    const failed = spawnSync(process.execPath, [...cliArgs, s.directory], {
      ...options,
      env: { ...options.env, FAIL_COMMAND: '1' },
    });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /HTTP 401/);
    const usage = spawnSync(process.execPath, cliArgs, options);
    assert.equal(usage.status, 1);
    assert.match(usage.stderr, /Usage: finalize-release.mjs/);
  });
});
