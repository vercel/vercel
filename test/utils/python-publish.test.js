const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, basename } = require('node:path');
const test = globalThis.test || require('node:test').test;

const version = '1.2.3';
const release = (name, type = 'patch') => ({
  name: `@vercel/python-${name}`,
  type,
  oldVersion: type === 'none' ? version : '1.2.2',
  newVersion: version,
});
const entry = name => ({
  name: `vercel-${name}`,
  version,
  files: [
    `vercel-${name}/dist/vercel_${name}-${version}-py3-none-any.whl`,
    `vercel-${name}/dist/vercel_${name}-${version}.tar.gz`,
  ],
});
const pypi = name => `https://pypi.org/pypi/vercel-${name}/${version}/json`;
const published = files => ({
  status: 200,
  body: { urls: files.map(file => ({ filename: basename(file) })) },
});

// Exercise the CLI against a disposable source tree. All commands and fetches
// are intercepted in the child: no real uv, pytest, build, publish, or network.
function scenario(name, check) {
  test(name, () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(join(tmpdir(), 'python publish '))
    );
    const write = (path, content) => {
      fs.mkdirSync(join(root, path, '..'), { recursive: true });
      fs.writeFileSync(join(root, path), content);
    };
    const json = (path, value) => write(path, JSON.stringify(value));
    try {
      for (const path of [
        'python/publish.mjs',
        'utils/get-python-packages.js',
      ]) {
        write(path, fs.readFileSync(resolve(__dirname, '../..', path)));
      }
      for (const name of ['runtime', 'workers']) {
        write(
          `python/${name}/pyproject.toml`,
          `[project]\nname = "vercel-${name}"\nversion = "${version}"\n`
        );
        json(`python/${name}/package.json`, {
          name: `@vercel/python-${name}`,
          version,
        });
      }
      write(
        'packages/python/src/package-versions.ts',
        `export const VERCEL_RUNTIME_VERSION = '${version}';\n` +
          `export const VERCEL_WORKERS_VERSION = '${version}';\n`
      );
      json('plan.json', {
        releases: [
          release('runtime'),
          release('workers', 'none'),
          { name: '@vercel/node', type: 'patch', newVersion: '2.0.0' },
        ],
      });
      write(
        'mock.cjs',
        `const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
if (process.env.MOCK_WINDOWS_RELATIVE) path.relative = path.win32.relative;
const log = call => fs.appendFileSync('calls.jsonl', JSON.stringify(call) + '\\n');
cp.execFileSync = (cmd, args, options) => {
  assert.equal(cmd, 'uv');
  log({ cmd, args, cwd: options.cwd });
  if (args[0] === process.env.MOCK_FAIL_COMMAND) {
    throw Object.assign(new Error('mock command error'), { status: 17 });
  }
  if (args[0] === 'build') {
    const name = args[args.indexOf('--package') + 1].replaceAll('-', '_');
    const dist = args[args.indexOf('--out-dir') + 1];
    fs.mkdirSync(dist, { recursive: true });
    const files = process.env.MOCK_DIST_FILES
      ? JSON.parse(process.env.MOCK_DIST_FILES)
      : [name + '-${version}-py3-none-any.whl', name + '-${version}.tar.gz'];
    for (const file of files) fs.writeFileSync(path.join(dist, file), 'mock distribution');
  } else if (args[0] === 'run') {
    assert.ok(fs.existsSync(args[args.indexOf('--with') + 1]));
    assert.equal(fs.existsSync('payload/python/manifest.json'), false);
  } else {
    assert.equal(args[0], 'publish');
  }
};
require('node:module').syncBuiltinESMExports();
globalThis.fetch = async (url, options) => {
  log({ url, method: options.method });
  assert.equal(options.method, 'GET');
  assert.ok(options.signal instanceof AbortSignal);
  const response = JSON.parse(process.env.MOCK_PYPI || '{}')[url];
  assert.notEqual(response, undefined, 'unexpected PyPI check');
  if (response === 'network-error') throw new Error('mock network error');
  const status = response.status ?? response;
  return { ok: status === 200, status, json: async () => response.body };
};
`
      );
      const out = join(root, 'payload/python');
      const f = {
        root,
        out,
        write,
        json,
        pack: ['--pack-only', '--plan', 'plan.json', '--out', 'payload/python'],
        manifest: () => JSON.parse(fs.readFileSync(join(out, 'manifest.json'))),
        calls: () =>
          fs.existsSync(join(root, 'calls.jsonl'))
            ? fs
                .readFileSync(join(root, 'calls.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map(line => JSON.parse(line))
            : [],
        run(args, env = {}, status = 0) {
          fs.rmSync(join(root, 'calls.jsonl'), { force: true });
          const result = spawnSync(
            process.execPath,
            [
              '--require',
              join(root, 'mock.cjs'),
              'python/publish.mjs',
              ...args,
            ],
            { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' }
          );
          assert.equal(result.status, status, result.stderr);
          return result;
        },
        save(packages) {
          json('payload/python/manifest.json', { packages });
          for (const pkg of packages) {
            for (const file of pkg.files)
              write(`payload/python/${file}`, 'saved');
          }
        },
        removeSources() {
          for (const dir of ['python/runtime', 'python/workers', 'packages']) {
            fs.rmSync(join(root, dir), { recursive: true, force: true });
          }
        },
      };
      check(f);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

scenario(
  'packs only changed Python plan entries and tests the installed wheel',
  f => {
    f.write('payload/python/vercel-runtime/dist/stale.whl', 'stale');
    f.json('payload/python/manifest.json', { packages: [entry('workers')] });
    f.run(f.pack);
    assert.deepEqual(f.manifest(), { packages: [entry('runtime')] });
    const wheel = join(f.out, entry('runtime').files[0]);
    assert.deepEqual(f.calls(), [
      {
        cmd: 'uv',
        args: [
          'build',
          '--package',
          'vercel-runtime',
          '--out-dir',
          `${join(f.out, 'vercel-runtime', 'dist')}/`,
        ],
        cwd: f.root,
      },
      {
        cmd: 'uv',
        args: [
          'run',
          '--only-group=test',
          '--locked',
          '--isolated',
          '--project=python/runtime',
          '--with',
          wheel,
          'pytest',
          '-v',
          '--tb=short',
          '-k',
          'not test_cqa_',
          'python/runtime/tests',
        ],
        cwd: f.root,
      },
    ]);
    for (const file of entry('runtime').files) {
      assert.equal(
        fs.readFileSync(join(f.out, file), 'utf8'),
        'mock distribution'
      );
    }
    assert.equal(
      fs.existsSync(join(f.out, 'vercel-runtime/dist/stale.whl')),
      false
    );
    assert.equal(fs.existsSync(join(f.root, 'python/runtime/dist')), false);
  }
);

scenario(
  'normalizes Windows-relative manifest paths to POSIX separators',
  f => {
    f.run(f.pack, { MOCK_WINDOWS_RELATIVE: '1' });
    assert.deepEqual(f.manifest(), { packages: [entry('runtime')] });
  }
);

scenario(
  'packs multiple changed packages into separate distribution directories',
  f => {
    f.json('plan.json', { releases: [release('runtime'), release('workers')] });
    f.run(f.pack);
    assert.deepEqual(f.manifest(), {
      packages: [entry('runtime'), entry('workers')],
    });
    assert.deepEqual(
      f.calls().map(call => call.args[0]),
      ['build', 'run', 'build', 'run']
    );
  }
);

scenario('writes an empty manifest when no Python versions change', f => {
  f.json('plan.json', {
    releases: [
      release('runtime', 'none'),
      { name: 'vercel', type: 'patch', newVersion: '2.0.0' },
    ],
  });
  f.run(f.pack);
  assert.deepEqual(f.manifest(), { packages: [] });
  assert.deepEqual(f.calls(), []);
});

scenario(
  'rejects a plan version differing from the frozen pyproject before building',
  f => {
    f.json('plan.json', {
      releases: [{ ...release('runtime'), newVersion: '1.2.4' }],
    });
    const result = f.run(f.pack, {}, 1);
    assert.match(
      result.stderr,
      /pyproject.toml has 1.2.3, plan requires 1.2.4/
    );
    assert.deepEqual(f.calls(), []);
    assert.equal(fs.existsSync(join(f.out, 'manifest.json')), false);
  }
);

scenario('retains the generated version-pin check before building', f => {
  f.write(
    'packages/python/src/package-versions.ts',
    "export const VERCEL_RUNTIME_VERSION = '1.2.2';\n"
  );
  const result = f.run(f.pack, {}, 1);
  assert.match(result.stderr, /Version mismatch/);
  assert.deepEqual(f.calls(), []);
});

for (const command of ['build', 'run']) {
  scenario(`does not leave a manifest when ${command} fails`, f => {
    f.json('payload/python/manifest.json', { packages: [entry('runtime')] });
    const result = f.run(f.pack, { MOCK_FAIL_COMMAND: command }, 1);
    assert.match(result.stderr, /command failed with exit code 17/);
    assert.equal(fs.existsSync(join(f.out, 'manifest.json')), false);
    assert.deepEqual(
      f.calls().map(call => call.args[0]),
      command === 'build' ? ['build'] : ['build', 'run']
    );
  });
}

for (const files of [
  ['one.whl'],
  ['one.tar.gz'],
  ['one.whl', 'two.whl', 'one.tar.gz'],
]) {
  scenario(`requires one wheel and sdist: ${files.join(', ')}`, f => {
    f.run(f.pack, { MOCK_DIST_FILES: JSON.stringify(files) }, 1);
    assert.equal(fs.existsSync(join(f.out, 'manifest.json')), false);
    assert.deepEqual(
      f.calls().map(call => call.args[0]),
      ['build']
    );
  });
}

scenario(
  'publishes only manifest files, skipping packages with all files already on PyPI without source',
  f => {
    f.json('plan.json', { releases: [release('runtime'), release('workers')] });
    f.run(f.pack);
    f.removeSources();
    f.write(
      'payload/python/vercel-workers/dist/not-in-manifest.whl',
      'ignored'
    );
    const result = f.run(['--artifacts', f.out], {
      MOCK_PYPI: JSON.stringify({
        [pypi('runtime')]: published(entry('runtime').files),
        [pypi('workers')]: 404,
      }),
    });
    assert.match(
      result.stdout,
      /vercel-runtime 1.2.3 files already on PyPI, skipping/
    );
    assert.deepEqual(f.calls(), [
      { url: pypi('runtime'), method: 'GET' },
      { url: pypi('workers'), method: 'GET' },
      {
        cmd: 'uv',
        args: [
          'publish',
          ...entry('workers').files.map(file => join(f.out, file)),
        ],
        cwd: f.root,
      },
    ]);
  }
);

scenario(
  'an empty artifact manifest needs neither source, network, nor uv',
  f => {
    f.save([]);
    f.removeSources();
    f.run(['--artifacts', 'payload/python']);
    assert.deepEqual(f.calls(), []);
  }
);

for (const status of [401, 403, 500, 501, 'network-error']) {
  scenario(`does not publish when the PyPI check fails: ${status}`, f => {
    f.save([entry('runtime')]);
    const result = f.run(
      ['--artifacts', f.out],
      {
        MOCK_PYPI: JSON.stringify({ [pypi('runtime')]: status }),
      },
      1
    );
    assert.match(result.stderr, /could not list published files/);
    assert.match(
      result.stderr,
      status === 'network-error'
        ? /mock network error/
        : new RegExp(`HTTP ${status}`)
    );
    assert.deepEqual(f.calls(), [{ url: pypi('runtime'), method: 'GET' }]);
  });
}

for (const body of [
  {},
  { urls: null },
  { urls: {} },
  { urls: 'invalid' },
  { urls: [null] },
  { urls: [{}] },
  { urls: [{ filename: 123 }] },
  { urls: [{ filename: '' }] },
]) {
  scenario(
    `rejects invalid PyPI urls before publishing: ${JSON.stringify(body)}`,
    f => {
      f.save([entry('runtime')]);
      const result = f.run(
        ['--artifacts', f.out],
        {
          MOCK_PYPI: JSON.stringify({
            [pypi('runtime')]: { status: 200, body },
          }),
        },
        1
      );
      assert.match(
        result.stderr,
        /invalid PyPI response: expected "urls" entries with filenames/
      );
      assert.deepEqual(f.calls(), [{ url: pypi('runtime'), method: 'GET' }]);
    }
  );
}

scenario(
  'resumes a partial upload and skips a completed retry without building or testing',
  f => {
    const pkg = entry('runtime');
    f.save([pkg]);
    f.removeSources();
    const result = f.run(
      ['--artifacts', f.out],
      {
        MOCK_PYPI: JSON.stringify({ [pypi('runtime')]: 404 }),
        MOCK_FAIL_COMMAND: 'publish',
      },
      1
    );
    assert.match(result.stderr, /command failed with exit code 17/);
    assert.deepEqual(f.calls(), [
      { url: pypi('runtime'), method: 'GET' },
      {
        cmd: 'uv',
        args: ['publish', ...pkg.files.map(file => join(f.out, file))],
        cwd: f.root,
      },
    ]);

    // The wheel made it to PyPI before the previous attempt failed on the sdist.
    f.run(['--artifacts', f.out], {
      MOCK_PYPI: JSON.stringify({
        [pypi('runtime')]: published([pkg.files[0]]),
      }),
    });
    assert.deepEqual(f.calls(), [
      { url: pypi('runtime'), method: 'GET' },
      { cmd: 'uv', args: ['publish', join(f.out, pkg.files[1])], cwd: f.root },
    ]);

    const completed = f.run(['--artifacts', f.out], {
      MOCK_PYPI: JSON.stringify({ [pypi('runtime')]: published(pkg.files) }),
    });
    assert.match(
      completed.stdout,
      /files already on PyPI, skipping publication/
    );
    assert.deepEqual(f.calls(), [{ url: pypi('runtime'), method: 'GET' }]);
  }
);

scenario(
  'publishes both saved files when an existing version has no file entries',
  f => {
    const pkg = entry('runtime');
    f.save([pkg]);
    f.run(['--artifacts', f.out], {
      MOCK_PYPI: JSON.stringify({ [pypi('runtime')]: published([]) }),
    });
    assert.deepEqual(f.calls(), [
      { url: pypi('runtime'), method: 'GET' },
      {
        cmd: 'uv',
        args: ['publish', ...pkg.files.map(file => join(f.out, file))],
        cwd: f.root,
      },
    ]);
  }
);

scenario('never falls back to uv default globs for an empty files list', f => {
  f.save([{ ...entry('runtime'), files: [] }]);
  const result = f.run(
    ['--artifacts', f.out],
    {
      MOCK_PYPI: JSON.stringify({ [pypi('runtime')]: 404 }),
    },
    1
  );
  assert.match(result.stderr, /no saved distributions/);
  assert.deepEqual(f.calls(), [{ url: pypi('runtime'), method: 'GET' }]);
});

for (const args of [
  ['--force'],
  ['--package', 'vercel-runtime'],
  ['--package=all'],
  ['--pack-only'],
  ['--pack-only', '--plan', 'plan.json', '--out'],
  ['--plan', 'plan.json'],
  ['--artifacts'],
  ['--artifacts', '--pack-only'],
  ['--artifacts', 'payload/python', '--plan', 'plan.json'],
  ['--artifacts', 'payload/python', '--out', 'payload/python'],
  ['--artifacts', 'payload/python', '--force'],
  ['--artifacts', 'payload/python', '--package', 'vercel-runtime'],
  [
    '--pack-only',
    '--plan',
    'plan.json',
    '--out',
    'payload/python',
    '--artifacts',
    'payload/python',
  ],
]) {
  scenario(
    `rejects incomplete, unsupported, or mixed modes: ${args.join(' ')}`,
    f => {
      const result = f.run(args, {}, 1);
      assert.match(result.stdout, /Usage:/);
      assert.deepEqual(f.calls(), []);
    }
  );
}

scenario(
  'bare invocation requires an explicit mode without running any commands',
  f => {
    const result = f.run([], {}, 1);
    assert.match(
      result.stderr,
      /specify exactly one of --pack-only or --artifacts/
    );
    assert.match(result.stdout, /Usage:/);
    assert.deepEqual(f.calls(), []);
  }
);

scenario(
  'help documents only the two explicit modes without running commands',
  f => {
    const result = f.run(['--help']);
    assert.match(result.stdout, /--pack-only --plan <path> --out <dir>/);
    assert.match(result.stdout, /--artifacts <dir>/);
    assert.doesNotMatch(result.stdout, /--force|--package/);
    assert.deepEqual(f.calls(), []);
  }
);
