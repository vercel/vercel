const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { mkdtemp, mkdir, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./pack-version-candidate.mjs');
const sha = 'a'.repeat(40);
const release = name => ({
  name,
  oldVersion: '1.0.0',
  newVersion: '1.1.0',
  type: 'minor',
});

async function fixture(check) {
  const root = await mkdtemp(join(tmpdir(), 'candidate packages '));
  const workspace = [];
  for (const [dir, name, privatePackage] of [
    ['cli', 'vercel', false],
    ['builder', '@vercel/builder', false],
    ['internal', '@vercel-internals/example', true],
    ['unchanged', '@vercel/unchanged', false],
    ['python-runtime', '@vercel/python-runtime', true],
  ]) {
    const path = join(root, 'packages', dir);
    await mkdir(path, { recursive: true });
    await writeFile(
      join(path, 'package.json'),
      JSON.stringify({
        name,
        version: '1.1.0',
        private: privatePackage,
        ...(name === 'vercel'
          ? { builders: { '@vercel/builder': 'workspace:*' } }
          : {}),
      })
    );
    workspace.push({ name, path });
  }
  const state = {
    root,
    workspace,
    packs: [],
    head: sha,
    topologicalPaths: [3, 1, 2, 0, 4].map(index => workspace[index].path),
    committed: {
      'packages/cli/package.json': readFileSync(
        join(root, 'packages/cli/package.json')
      ),
      'packages/vc-native/bin/vercel': Buffer.from(
        '#!/usr/bin/env node\n// H\n'
      ),
      'packages/vc-native/postinstall.mjs': Buffer.from(
        '// postinstall at H\r\n'
      ),
      'packages/cli/CHANGELOG.md': Buffer.from('# Changelog at H\n'),
    },
    plan: { releases: workspace.slice(0, 3).map(pkg => release(pkg.name)) },
    options: {
      root,
      sourceSha: sha,
      outputDirectory: join(root, 'out'),
      runId: '123',
      runAttempt: '2',
    },
  };
  // No dependency install or registry access. Fake pack bytes and tar inspection
  // let these tests exercise selection, production injection and failure paths.
  state.options.run = (command, args, options) => {
    if (command === 'git' && args[0] === 'rev-parse') return state.head;
    if (command === 'git' && args[0] === 'ls-tree') {
      assert.deepEqual(args.slice(0, 4), ['ls-tree', '--name-only', sha, '--']);
      return Object.hasOwn(state.committed, args[4]) ? `${args[4]}\n` : '';
    }
    if (command === 'git' && args[0] === 'show') {
      assert.ok(args[1].startsWith(`${sha}:`));
      const path = args[1].slice(sha.length + 1);
      if (path === (state.planPath || '.release-plan.json')) {
        if (state.missingPlan) throw new Error('Plan is not committed');
        return JSON.stringify(state.plan);
      }
      assert.ok(state.committed[path], `Missing committed ${path}`);
      return state.committed[path];
    }
    if (command === 'pnpm' && args[0] === '--workspace-concurrency=1') {
      assert.deepEqual(args, [
        '--workspace-concurrency=1',
        'recursive',
        'exec',
        'pwd',
      ]);
      return `${state.topologicalPaths.join('\n')}\n`;
    }
    if (command === 'pnpm' && args[0] === 'ls') {
      assert.deepEqual(args, ['ls', '-r', '--depth', '-1', '--json']);
      return JSON.stringify(workspace);
    }
    if (command === 'pnpm' && args[0] === 'pack') {
      assert.equal(options.env.npm_config_ignore_scripts, 'false');
      assert.deepEqual(args, [
        'pack',
        '--pack-destination',
        state.options.outputDirectory,
      ]);
      const pkg = JSON.parse(readFileSync(join(options.cwd, 'package.json')));
      state.packs.push(pkg);
      if (state.failPack === pkg.name) throw new Error('pack failed');
      // Model pnpm's production prepack hook resolving custom builder entries.
      if (pkg.builders && !state.unresolved)
        pkg.builders['@vercel/builder'] = '1.1.0';
      if (state.wrongVersion) pkg.version = '9.9.9';
      Object.assign(pkg, state.packedOverrides);
      const path = join(args[2], `${pkg.name.replace(/[@/]/g, '')}.tgz`);
      writeFileSync(path, JSON.stringify(pkg));
      return state.reported || `lifecycle output\n${path}\n`;
    }
    if (command === 'tar' && args[0] === '-xzf') {
      assert.deepEqual(args.slice(2), ['-C', args[3], '--strip-components=1']);
      mkdirSync(args[3], { recursive: true });
      writeFileSync(join(args[3], 'package.json'), readFileSync(args[1]));
      return '';
    }
    if (command === 'npm' && args[0] === 'pack') {
      assert.deepEqual(args.slice(0, 4), [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
      ]);
      const pkg = JSON.parse(readFileSync(join(options.cwd, 'package.json')));
      state.cliSupport = pkg;
      const filename = 'vercel-cli-support-1.1.0.tgz';
      writeFileSync(join(args[4], filename), JSON.stringify(pkg));
      return JSON.stringify([{ filename }]);
    }
    if (command === 'tar') {
      assert.equal(args[0], '-xOf');
      assert.equal(args[2], 'package/package.json');
      return readFileSync(args[1], 'utf8');
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };
  try {
    await check(state, (await load).packVersionCandidate);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('packs only planned public releases with exact versions, native pins and byte inventory', async () => {
  await fixture(async (state, pack) => {
    const cli = join(state.workspace[0].path, 'package.json');
    const original = await readFile(cli, 'utf8');
    const manifest = await pack(state.options);
    assert.deepEqual(
      manifest.packages.map(pkg => pkg.name),
      ['@vercel/builder', '@vercel/cli-support', 'vercel']
    );
    assert.equal(manifest.packages[1].generated, true);
    const { cliSupportOs } = await import('./publish-cli-support.mjs');
    assert.deepEqual(state.cliSupport.os, cliSupportOs);
    assert.equal(state.cliSupport.bin, undefined);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.sourceSha, sha);
    assert.equal(manifest.cliVersion, '1.1.0');
    assert.equal(manifest.packages[2].changelog, 'changelogs/vercel.tgz.md');
    for (const [source, destination] of [
      ['packages/vc-native/bin/vercel', 'native-wrapper/bin/vercel'],
      ['packages/vc-native/postinstall.mjs', 'native-wrapper/postinstall.mjs'],
      ['packages/cli/CHANGELOG.md', 'cli-changelog.md'],
      ['packages/cli/CHANGELOG.md', 'changelogs/vercel.tgz.md'],
    ]) {
      assert.deepEqual(
        await readFile(join(state.options.outputDirectory, destination)),
        state.committed[source]
      );
    }
    assert.equal(manifest.workflowRunId, '123');
    assert.equal(manifest.workflowRunAttempt, '2');
    assert.equal(manifest.planPath, '.release-plan.json');
    assert.deepEqual(manifest.releases, state.plan.releases);
    assert.deepEqual(manifest.tags, [
      { name: 'vercel', version: '1.1.0' },
      { name: '@vercel/builder', version: '1.1.0' },
      { name: '@vercel-internals/example', version: '1.1.0' },
    ]);
    for (const pkg of manifest.packages) {
      const bytes = await readFile(
        join(state.options.outputDirectory, pkg.tarball)
      );
      assert.equal(pkg.version, '1.1.0');
      assert.equal(pkg.size, bytes.length);
      assert.equal(
        pkg.integrity,
        `sha512-${createHash('sha512').update(bytes).digest('base64')}`
      );
    }
    const { platforms } = await import(
      '../packages/vc-native/scripts/platforms.mjs'
    );
    const { cliSupportName } = await import('./publish-cli-support.mjs');
    assert.deepEqual(
      state.packs[1].optionalDependencies,
      Object.fromEntries(
        [
          ...platforms
            .filter(platform => !platform.os.includes('win32'))
            .map(platform => platform.name),
          cliSupportName,
        ]
          .sort()
          .map(name => [name, '1.1.0'])
      )
    );
    assert.equal(await readFile(cli, 'utf8'), original);
    assert.deepEqual(
      JSON.parse(
        await readFile(join(state.options.outputDirectory, 'manifest.json'))
      ),
      manifest
    );
  });
});

test('records a public package changelog with exact H bytes, not working-tree edits', async () => {
  await fixture(async (state, pack) => {
    state.plan.releases = [release('@vercel/builder')];
    const source = 'packages/builder/CHANGELOG.md';
    const bytes = Buffer.from(
      '# Builder changelog\r\n\r\n## 1.1.0\r\n\r\nFixed café output.\r\n'
    );
    state.committed[source] = bytes;
    await writeFile(join(state.root, source), 'edited after H');
    const manifest = await pack(state.options);
    const [row] = manifest.packages;
    assert.equal(row.changelog, 'changelogs/vercelbuilder.tgz.md');
    assert.deepEqual(
      await readFile(join(state.options.outputDirectory, row.changelog)),
      bytes
    );
    const saved = JSON.parse(
      await readFile(join(state.options.outputDirectory, 'manifest.json'))
    );
    assert.equal(saved.packages[0].changelog, row.changelog);
  });
});

test('tolerates a public package without a changelog and omits the optional row field', async () => {
  await fixture(async (state, pack) => {
    state.plan.releases = [release('@vercel/builder')];
    const manifest = await pack(state.options);
    assert.equal(manifest.packages.length, 1);
    assert.equal(Object.hasOwn(manifest.packages[0], 'changelog'), false);
    assert.equal(
      existsSync(join(state.options.outputDirectory, 'changelogs')),
      false
    );
  });
});

test('copies companion bytes from H, not edited working-tree files', async () => {
  await fixture(async (state, pack) => {
    await mkdir(join(state.root, 'packages/vc-native/bin'), {
      recursive: true,
    });
    for (const path of [
      'packages/vc-native/bin/vercel',
      'packages/vc-native/postinstall.mjs',
      'packages/cli/CHANGELOG.md',
    ])
      await writeFile(join(state.root, path), 'edited after H');
    await pack(state.options);
    assert.deepEqual(
      await readFile(
        join(state.options.outputDirectory, 'native-wrapper/bin/vercel')
      ),
      state.committed['packages/vc-native/bin/vercel']
    );
    assert.deepEqual(
      await readFile(join(state.options.outputDirectory, 'cli-changelog.md')),
      state.committed['packages/cli/CHANGELOG.md']
    );
  });
});

test('does not write completion manifest if H companion data is missing', async () => {
  await fixture(async (state, pack) => {
    delete state.committed['packages/vc-native/postinstall.mjs'];
    await assert.rejects(pack(state.options), /Missing committed/);
    assert.equal(
      existsSync(join(state.options.outputDirectory, 'manifest.json')),
      false
    );
  });
});

test('freezes pnpm topological order, not plan or alphabetical order', async () => {
  await fixture(async (state, pack) => {
    state.plan.releases.push(release('@vercel/unchanged'));
    const manifest = await pack(state.options);
    assert.deepEqual(
      manifest.packages.map(pkg => pkg.name),
      ['@vercel/unchanged', '@vercel/builder', '@vercel/cli-support', 'vercel']
    );
    assert.deepEqual(
      state.packs.map(pkg => pkg.name),
      manifest.packages.filter(pkg => !pkg.generated).map(pkg => pkg.name)
    );
  });
});

for (const paths of [[1], [1, 1]]) {
  test(`rejects incomplete or duplicate workspace order: ${paths}`, async () => {
    await fixture(async (state, pack) => {
      state.topologicalPaths = paths.map(index => state.workspace[index].path);
      await assert.rejects(pack(state.options), /workspace (order|path)/);
      assert.deepEqual(state.packs, []);
    });
  });
}

for (const config of [
  {},
  { access: 'public' },
  { registry: 'https://registry.npmjs.org' },
  { access: 'public', registry: 'https://registry.npmjs.org/' },
]) {
  test(`accepts safe publishConfig ${JSON.stringify(config)}`, async () => {
    await fixture(async (state, pack) => {
      state.packedOverrides = { publishConfig: config };
      assert.equal((await pack(state.options)).packages.length, 3);
    });
  });
}

for (const overrides of [
  { tag: 'latest' },
  { tag: null },
  ...[
    null,
    [],
    'public',
    { tag: 'latest' },
    { access: 'restricted' },
    { registry: 'https://example.com' },
    { registry: ['https://registry.npmjs.org'] },
    { ignoreScripts: false },
    { 'ignore-scripts': false },
    { provenance: true },
    { directory: 'dist' },
    { 'fetch-retries': 2 },
  ].map(publishConfig => ({ publishConfig })),
]) {
  test(`rejects packed publish overrides ${JSON.stringify(overrides)}`, async () => {
    await fixture(async (state, pack) => {
      state.packedOverrides = overrides;
      await assert.rejects(pack(state.options), /Unsafe (tag|publishConfig)/);
      assert.equal(
        existsSync(join(state.options.outputDirectory, 'manifest.json')),
        false
      );
    });
  });
}

test('reads alternate committed PLAN_PATH, not the preparation receipt or edited plan', async () => {
  await fixture(async (state, pack) => {
    state.planPath = 'plans/npm.json';
    state.options.planPath = state.planPath;
    await writeFile(
      join(state.root, '.release-plan.json'),
      'invalid edited plan'
    );
    await writeFile(
      join(state.root, '.release-candidate.json'),
      JSON.stringify({ sourceSha: 'b'.repeat(40) })
    );
    assert.equal((await pack(state.options)).sourceSha, sha);
  });
});

for (const [label, mutate, expected] of [
  [
    'non-SHA ref',
    s => {
      s.options.sourceSha = 'main';
    },
    /candidate SHA/,
  ],
  [
    'merge SHA instead of H',
    s => {
      s.head = 'b'.repeat(40);
    },
    /Expected values/,
  ],
  [
    'outside plan',
    s => {
      s.options.planPath = '../plan.json';
    },
    /inside the repository/,
  ],
  [
    'missing committed plan',
    s => {
      s.missingPlan = true;
    },
    /not committed/,
  ],
  [
    'missing inventory',
    s => {
      s.plan = {};
    },
    /releases array/,
  ],
  [
    'duplicate name',
    s => {
      s.plan.releases.push(release('vercel'));
    },
    /Duplicate release/,
  ],
  [
    'unknown name',
    s => {
      s.plan.releases.push(release('unknown'));
    },
    /Unknown or ambiguous/,
  ],
  [
    'bad bump',
    s => {
      s.plan.releases[0].type = 'patchy';
    },
    /Invalid release type/,
  ],
  [
    'missing old version',
    s => {
      delete s.plan.releases[0].oldVersion;
    },
    /oldVersion/,
  ],
  [
    'bad version',
    s => {
      s.plan.releases[0].newVersion = 'latest';
    },
    /match/,
  ],
  [
    'version drift',
    s => {
      s.plan.releases[0].newVersion = '1.2.0';
    },
    /Version mismatch/,
  ],
]) {
  test(`rejects ${label} before packing`, async () => {
    await fixture(async (state, pack) => {
      mutate(state);
      await assert.rejects(pack(state.options), expected);
      assert.deepEqual(state.packs, []);
      assert.equal(existsSync(state.options.outputDirectory), false);
    });
  });
}

for (const [label, mutate, expected] of [
  [
    'pack failure',
    s => {
      s.failPack = 'vercel';
    },
    /pack failed/,
  ],
  [
    'wrong packed version',
    s => {
      s.wrongVersion = true;
    },
    /Packed version mismatch/,
  ],
  [
    'unresolved builders',
    s => {
      s.unresolved = true;
    },
    /Unresolved builders/,
  ],
  [
    'escaped pack path',
    s => {
      s.reported = '../elsewhere.tgz';
    },
    /unique tarball/,
  ],
]) {
  test(`no completion manifest on ${label}; restores CLI manifest`, async () => {
    await fixture(async (state, pack) => {
      const cli = join(state.workspace[0].path, 'package.json');
      const original = await readFile(cli, 'utf8');
      mutate(state);
      await assert.rejects(pack(state.options), expected);
      assert.equal(
        existsSync(join(state.options.outputDirectory, 'manifest.json')),
        false
      );
      assert.equal(await readFile(cli, 'utf8'), original);
    });
  });
}

test('private-only plan retains internal and Python tags, excludes none, and packs no npm packages', async () => {
  await fixture(async (state, pack) => {
    state.plan.releases = [
      release('@vercel-internals/example'),
      release('@vercel/python-runtime'),
      { ...release('vercel'), type: 'none' },
    ];
    const manifest = await pack(state.options);
    assert.deepEqual(manifest.packages, []);
    assert.deepEqual(manifest.tags, [
      { name: '@vercel-internals/example', version: '1.1.0' },
      { name: '@vercel/python-runtime', version: '1.1.0' },
    ]);
    const saved = JSON.parse(
      await readFile(join(state.options.outputDirectory, 'manifest.json'))
    );
    assert.deepEqual(saved.tags, manifest.tags);
    assert.equal(manifest.cliVersion, '1.1.0');
    assert.equal(
      existsSync(join(state.options.outputDirectory, 'native-wrapper')),
      false
    );
    assert.deepEqual(state.packs, []);
  });
});

test('does not inject native dependencies when vercel is absent from the plan', async () => {
  await fixture(async (state, pack) => {
    state.plan.releases = [release('@vercel/builder')];
    const cli = join(state.workspace[0].path, 'package.json');
    const original = await readFile(cli, 'utf8');
    await writeFile(cli, JSON.stringify({ name: 'vercel', version: '9.9.9' }));
    const manifest = await pack(state.options);
    assert.equal(manifest.packages.length, 1);
    assert.equal(manifest.cliVersion, JSON.parse(original).version);
    assert.equal(JSON.parse(await readFile(cli, 'utf8')).version, '9.9.9');
    assert.equal(
      existsSync(join(state.options.outputDirectory, 'native-wrapper')),
      false
    );
    assert.equal(
      existsSync(join(state.options.outputDirectory, 'cli-changelog.md')),
      false
    );
  });
});

test('refuses an existing output directory instead of mixing payloads', async () => {
  await fixture(async (state, pack) => {
    await mkdir(state.options.outputDirectory);
    await assert.rejects(pack(state.options), /EEXIST/);
    assert.deepEqual(state.packs, []);
  });
});

test('workflow uses exact H, full toolchains, frozen install and immutable build-only artifact', () => {
  const workflow = readFileSync(
    join(__dirname, '../.github/workflows/candidate-packages.yml'),
    'utf8'
  );
  for (const value of [
    'workflow_call:',
    `ref: \${{ inputs.ref }}`,
    'persist-credentials: false',
    '[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]',
    '[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]]',
    'git cat-file -e "$SOURCE_SHA:.release-plan.json"',
    'actions/setup-node@',
    'setup-rust-toolchain@',
    'actions/setup-go@',
    'actions/setup-python@',
    'astral-sh/setup-uv@',
    'pnpm install --frozen-lockfile',
    'run: pnpm build',
    'node utils/pack-version-candidate.mjs',
    `version-packages-\${{ inputs.ref }}-attempt-\${{ github.run_attempt }}`,
    'retention-days: 30',
    'overwrite: false',
    'if-no-files-found: error',
    `value: \${{ jobs.pack.outputs.artifact-id }}`,
    `value: \${{ jobs.pack.outputs.artifact-url }}`,
    'Caller: version-packages.yml',
  ])
    assert.ok(workflow.includes(value), value);
  const npmPack = workflow.indexOf(
    'run: node utils/pack-version-candidate.mjs'
  );
  const pythonPack = workflow.indexOf(
    'run: node python/publish.mjs --pack-only --plan .release-plan.json --out "$RUNNER_TEMP/version-packages/python"'
  );
  const upload = workflow.indexOf('uses: actions/upload-artifact@');
  assert.ok(npmPack < pythonPack && pythonPack < upload);
  assert.doesNotMatch(
    workflow,
    /npm publish|ci:publish|environment: release|secrets: inherit|create-github-app-token|registry-url:|package-manager-cache:/
  );
});
