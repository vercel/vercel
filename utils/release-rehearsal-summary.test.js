const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  stat,
  symlink,
  link,
  readdir,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, relative } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./release-rehearsal-summary.mjs');
const sourceSha = 'a'.repeat(40);
const repository = 'vercel/vercel-internal';
const context = { sourceSha, repository };
const warning =
  'Proposed versions only. This preview does not change source versions or publish packages.';

// @changesets/cli@2.27.8 status --output shape, after internal expansion.
// Visibility is intentionally absent: status normally does not supply it.
function fixturePlan() {
  return {
    changesets: [
      {
        id: 'shared-helper',
        summary:
          'Fix **shared helpers**.\n\n- Preserve `options`.\n- See [docs](https://example.com).',
        releases: [
          { name: '@vercel-internals/runtimes', type: 'patch' },
          { name: 'vercel', type: 'patch' },
        ],
      },
      {
        id: 'new-feature',
        summary: 'Add a feature.',
        releases: [{ name: 'vercel', type: 'minor' }],
      },
      {
        id: 'breaking-change',
        summary: 'Remove legacy API.\n\n```js\napi.next();\n```',
        releases: [{ name: '@vercel/node', type: 'major' }],
      },
      { id: 'docs-only', summary: 'Documentation only.', releases: [] },
    ],
    releases: [
      {
        name: 'vercel',
        type: 'minor',
        oldVersion: '50.0.0',
        newVersion: '50.1.0',
        changesets: ['shared-helper', 'new-feature'],
      },
      {
        name: '@vercel/node',
        type: 'major',
        oldVersion: '5.2.0',
        newVersion: '6.0.0',
        changesets: ['breaking-change'],
      },
      {
        name: '@vercel-internals/runtimes',
        type: 'patch',
        oldVersion: '0.1.0',
        newVersion: '0.1.1',
        changesets: ['shared-helper'],
      },
      {
        name: '@vercel/dependent',
        type: 'patch',
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        changesets: [],
      },
    ],
  };
}

async function workspace(run) {
  const dir = await mkdtemp(join(tmpdir(), 'release preview '));
  const env = {
    PLAN_PATH: join(dir, 'plan.json'),
    SOURCE_SHA: sourceSha,
    GITHUB_REPOSITORY: repository,
    GITHUB_STEP_SUMMARY: join(dir, 'summary.md'),
    OUTPUT_DIR: join(dir, 'artifacts'),
  };
  try {
    await writeFile(env.PLAN_PATH, JSON.stringify(fixturePlan()));
    await run(env, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('renders proposed versions, all bump types, actual Markdown and pinned note sources', async () => {
  const { formatReleasePreview } = await load;
  const text = formatReleasePreview(fixturePlan(), context);
  assert.ok(text.startsWith('## Release preview from Changesets\n'));
  assert.ok(text.includes(warning));
  assert.ok(
    text.includes(`https://github.com/${repository}/commit/${sourceSha}`)
  );
  for (const release of fixturePlan().releases) {
    assert.ok(
      text.includes(
        `| ${release.name} | ${release.oldVersion} | ${release.newVersion} | ${release.type} | Not reported |`
      )
    );
  }
  assert.equal(text.split('> Fix **shared helpers**.').length - 1, 2);
  assert.ok(
    text.includes(
      '> - Preserve `options`.\n> - See [docs](https://example.com).'
    )
  );
  assert.ok(text.includes('> ```js\n> api.next();\n> ```'));
  assert.ok(
    text.includes(
      `https://github.com/${repository}/blob/${sourceSha}/.changeset/shared-helper.md`
    )
  );
  assert.ok(text.includes('Implicit dependency-only bump:'));
  assert.ok(text.includes('not a publication list'));
  assert.ok(text.includes('trusted repository Markdown'));
  assert.ok(!text.includes('Documentation only.'));
});

test('retains private/internal packages and uses optional visibility without guessing', async () => {
  const { formatReleasePreview } = await load;
  const plan = fixturePlan();
  plan.releases[0].private = false;
  plan.releases[2].private = true;
  const text = formatReleasePreview(plan, context);
  assert.ok(text.includes('| vercel | 50.0.0 | 50.1.0 | minor | Public |'));
  assert.ok(
    text.includes(
      '| @vercel-internals/runtimes | 0.1.0 | 0.1.1 | patch | Private |'
    )
  );
  assert.ok(
    text.includes('| @vercel/node | 5.2.0 | 6.0.0 | major | Not reported |')
  );
});

test('empty plans and non-release changesets clearly report no releases', async () => {
  const { formatReleasePreview } = await load;
  for (const changesets of [
    [],
    [{ id: 'docs-only', summary: 'Docs.', releases: [] }],
  ]) {
    const text = formatReleasePreview({ releases: [], changesets }, context);
    assert.ok(text.includes(warning));
    assert.ok(text.includes('No package releases are planned.'));
    assert.ok(!text.includes('| Package |'));
    assert.ok(!text.includes('####'));
  }
});

test('supports none entries, prerelease/build versions, empty notes and Markdown in package names', async () => {
  const { formatReleasePreview } = await load;
  const plan = {
    releases: [
      {
        name: 'foo_bar',
        type: 'none',
        oldVersion: '1.2.3-rc.1+build.2',
        newVersion: '1.2.3-rc.1+build.2',
        changesets: [],
      },
      {
        name: 'another',
        type: 'patch',
        oldVersion: '0.0.1',
        newVersion: '0.0.2',
        changesets: ['empty-note'],
      },
    ],
    changesets: [
      {
        id: 'empty-note',
        summary: '',
        releases: [{ name: 'another', type: 'patch' }],
      },
    ],
  };
  const text = formatReleasePreview(plan, context);
  assert.ok(text.includes('| foo\\_bar | 1.2.3-rc.1+build.2 |'));
  assert.ok(text.includes('No version bump or direct changeset notes'));
  assert.ok(text.includes('No changeset note was supplied.'));
  assert.ok(!text.includes('Implicit dependency-only bump'));
});

test('preserves trusted HTML/Markdown note data without evaluating scripts', async () => {
  const { formatReleasePreview } = await load;
  const plan = fixturePlan();
  plan.changesets[1].summary =
    '<details>\r\n<summary>More</summary>\r\n\r\n`$(touch should-not-exist)`\r\n</details>';
  const text = formatReleasePreview(plan, context);
  assert.ok(
    text.includes(
      '> <details>\n> <summary>More</summary>\n> \n> `$(touch should-not-exist)`\n> </details>'
    )
  );
});

test('orders packages and changeset IDs deterministically without mutating the plan', async () => {
  const { formatReleasePreview } = await load;
  const plan = fixturePlan();
  const before = JSON.stringify(plan);
  const expected = formatReleasePreview(plan, context);
  assert.equal(JSON.stringify(plan), before);
  plan.releases.reverse();
  plan.changesets.reverse();
  for (const release of plan.releases) release.changesets.reverse();
  assert.equal(formatReleasePreview(plan, context), expected);
  assert.ok(
    expected.indexOf('#### @vercel-internals/runtimes') <
      expected.indexOf('#### vercel')
  );
  assert.ok(
    expected.indexOf('Changeset [new-feature]') <
      expected.lastIndexOf('Changeset [shared-helper]')
  );
});

test('rejects invalid schema, duplicate IDs/names, unknown references and visibility', async () => {
  const { formatReleasePreview } = await load;
  for (const bad of [
    null,
    [],
    {},
    { releases: [] },
    { changesets: [] },
    { releases: {}, changesets: [] },
  ]) {
    assert.throws(
      () => formatReleasePreview(bad, context),
      /Invalid Changesets plan/
    );
  }
  for (const mutate of [
    p => {
      p.releases[0] = null;
    },
    p => {
      p.changesets[0] = null;
    },
    p => {
      p.changesets[0].summary = {};
    },
    p => {
      delete p.changesets[0].releases;
    },
    p => {
      delete p.releases[0].changesets;
    },
    p => {
      p.releases[0].changesets = ['missing-id'];
    },
    p => {
      p.releases[0].changesets = ['shared-helper', 'shared-helper'];
    },
    p => {
      p.changesets.push(p.changesets[0]);
    },
    p => {
      p.releases.push(p.releases[0]);
    },
    p => {
      p.changesets[0].releases.push(p.changesets[0].releases[0]);
    },
    p => {
      p.releases[0].private = 'false';
    },
    p => {
      p.releases[0].type = 'prerelease';
    },
    p => {
      p.changesets[0].releases[0].type = 'publish';
    },
  ]) {
    const plan = fixturePlan();
    mutate(plan);
    assert.throws(() => formatReleasePreview(plan, context));
  }
});

test('rejects invalid names, versions, source/context and source link injection', async () => {
  const { formatReleasePreview } = await load;
  for (const name of [
    '',
    'Uppercase',
    '../bad',
    '@scope',
    'name|evil',
    'x\n<script>',
    'x`oops',
    'foo bar',
    'x'.repeat(215),
  ]) {
    const plan = fixturePlan();
    plan.releases[0].name = name;
    assert.throws(() => formatReleasePreview(plan, context), /package name/);
    plan.releases[0].name = 'vercel';
    plan.changesets[0].releases[0].name = name;
    assert.throws(() => formatReleasePreview(plan, context), /package name/);
  }
  for (const version of [
    '',
    'v1.0.0',
    '1.0',
    '01.0.0',
    '1.0.0-01',
    '1.0.0-',
    '1.0.0\n',
    '1.0.0|<script>',
    123,
  ]) {
    for (const field of ['oldVersion', 'newVersion']) {
      const plan = fixturePlan();
      plan.releases[0][field] = version;
      assert.throws(() => formatReleasePreview(plan, context), /SemVer/);
    }
  }
  for (const sha of [
    'main',
    'a'.repeat(39),
    'A'.repeat(40),
    `${sourceSha}\n`,
    null,
  ]) {
    assert.throws(
      () => formatReleasePreview(fixturePlan(), { ...context, sourceSha: sha }),
      /SOURCE_SHA/
    );
  }
  for (const repo of [
    'https://github.com/a/b',
    'a/b/c',
    '../repo',
    'a/b?x',
    'a/b\n',
    'a/<script>',
    null,
  ]) {
    assert.throws(
      () =>
        formatReleasePreview(fixturePlan(), { ...context, repository: repo }),
      /GITHUB_REPOSITORY/
    );
  }
  for (const id of [
    '../escape',
    'note.md',
    'bad#anchor',
    '<script>',
    'bad\n',
    '',
  ]) {
    const plan = fixturePlan();
    plan.changesets[0].id = id;
    assert.throws(
      () => formatReleasePreview(plan, context),
      /changeset schema/
    );
  }
});

test('CLI accepts the five env keys and relative paths, appends and leaves source plan untouched', async () => {
  const { formatReleasePreview } = await load;
  await workspace(async (env, dir) => {
    const before = await readFile(env.PLAN_PATH);
    const metadata = await stat(env.PLAN_PATH);
    await writeFile(env.GITHUB_STEP_SUMMARY, 'Existing fixture summary.\n');
    const result = spawnSync(
      process.execPath,
      [join(__dirname, 'release-rehearsal-summary.mjs')],
      {
        env: {
          ...process.env,
          ...env,
          PLAN_PATH: relative(dir, env.PLAN_PATH),
          OUTPUT_DIR: 'artifacts',
        },
        cwd: dir,
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    const full = formatReleasePreview(fixturePlan(), context);
    assert.equal(
      await readFile(join(env.OUTPUT_DIR, 'release-preview.md'), 'utf8'),
      full
    );
    assert.equal(
      await readFile(env.GITHUB_STEP_SUMMARY, 'utf8'),
      `Existing fixture summary.\n\n\n${full}`
    );
    assert.deepEqual(await readFile(env.PLAN_PATH), before);
    assert.equal((await stat(env.PLAN_PATH)).mtimeMs, metadata.mtimeMs);
    assert.deepEqual((await readdir(dir)).sort(), [
      'artifacts',
      'plan.json',
      'summary.md',
    ]);
  });
});

test('caps UTF-8 summary bytes, preserves header/warning and writes a complete large artifact', async () => {
  const { writeReleasePreview, SUMMARY_LIMIT } = await load;
  await workspace(async env => {
    const plan = fixturePlan();
    plan.changesets[0].summary = `\`\`\`text\n${'多字节 🦊\n'.repeat(100000)}\`\`\`\nEND OF NOTE`;
    await writeFile(env.PLAN_PATH, JSON.stringify(plan));
    const prefix = 'Earlier preparation output.\n';
    await writeFile(env.GITHUB_STEP_SUMMARY, prefix);
    const artifact = await writeReleasePreview(env);
    const summary = await readFile(env.GITHUB_STEP_SUMMARY, 'utf8');
    const full = await readFile(artifact, 'utf8');
    assert.ok(Buffer.byteLength(summary) <= SUMMARY_LIMIT);
    assert.ok(Buffer.byteLength(full) > SUMMARY_LIMIT);
    assert.ok(
      summary.startsWith(`${prefix}\n\n## Release preview from Changesets`)
    );
    assert.ok(summary.includes(warning));
    assert.ok(summary.includes('Preview truncated'));
    assert.ok(summary.includes('`release-preview.md` artifact'));
    assert.ok(!summary.includes('多字节'));
    assert.ok(!summary.includes('\ufffd'));
    assert.equal(full.split('END OF NOTE').length - 1, 2);
    assert.ok(!full.includes('Preview truncated'));
  });
});

test('accounts for existing summary bytes, and never cuts a note or warning to fill the cap', async () => {
  const { writeReleasePreview, SUMMARY_LIMIT } = await load;
  await workspace(async env => {
    const prefix = 'x'.repeat(SUMMARY_LIMIT - 1400);
    await writeFile(env.GITHUB_STEP_SUMMARY, prefix);
    await writeReleasePreview(env);
    const summary = await readFile(env.GITHUB_STEP_SUMMARY, 'utf8');
    assert.ok(summary.startsWith(prefix));
    assert.ok(summary.includes(warning));
    assert.ok(summary.includes('Preview truncated'));
    assert.ok(Buffer.byteLength(summary) <= SUMMARY_LIMIT);
  });
  await workspace(async env => {
    const prefix = 'x'.repeat(SUMMARY_LIMIT - 20);
    await writeFile(env.GITHUB_STEP_SUMMARY, prefix);
    await assert.rejects(writeReleasePreview(env), /insufficient space/);
    assert.equal(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8'), prefix);
    assert.ok(
      (
        await readFile(join(env.OUTPUT_DIR, 'release-preview.md'), 'utf8')
      ).includes(warning)
    );
  });
});

test('uses the full summary at exactly 1 MiB and truncates one byte above it', async () => {
  const { formatReleasePreview, writeReleasePreview, SUMMARY_LIMIT } =
    await load;
  const full = formatReleasePreview(fixturePlan(), context);
  for (const overflow of [0, 1]) {
    await workspace(async env => {
      const prefix = 'x'.repeat(
        SUMMARY_LIMIT - Buffer.byteLength(full) - 2 + overflow
      );
      await writeFile(env.GITHUB_STEP_SUMMARY, prefix);
      await writeReleasePreview(env);
      const text = await readFile(env.GITHUB_STEP_SUMMARY, 'utf8');
      assert.equal(text.includes('Preview truncated'), overflow === 1);
      assert.ok(Buffer.byteLength(text) <= SUMMARY_LIMIT);
      if (!overflow) assert.equal(Buffer.byteLength(text), SUMMARY_LIMIT);
      assert.ok(text.includes(warning));
    });
  }
});

test('rejects invalid path metadata and aliased paths without changing the plan', async () => {
  const { writeReleasePreview } = await load;
  await workspace(async env => {
    const before = await readFile(env.PLAN_PATH);
    for (const key of ['PLAN_PATH', 'OUTPUT_DIR', 'GITHUB_STEP_SUMMARY']) {
      for (const value of [
        undefined,
        '',
        ' ',
        'bad\npath',
        'bad\0path',
        'https://example.com/path',
      ]) {
        await assert.rejects(
          writeReleasePreview({ ...env, [key]: value }),
          new RegExp(key)
        );
      }
    }
    await assert.rejects(
      writeReleasePreview({ ...env, GITHUB_STEP_SUMMARY: env.PLAN_PATH }),
      /distinct/
    );
    await assert.rejects(
      writeReleasePreview({
        ...env,
        GITHUB_STEP_SUMMARY: join(env.OUTPUT_DIR, 'release-preview.md'),
      }),
      /distinct/
    );
    assert.deepEqual(await readFile(env.PLAN_PATH), before);
  });
});

test('does not follow summary symlinks, append to hardlinked source, or overwrite artifacts', async () => {
  const { writeReleasePreview } = await load;
  for (const makeLink of [symlink, link]) {
    await workspace(async env => {
      const before = await readFile(env.PLAN_PATH);
      await makeLink(env.PLAN_PATH, env.GITHUB_STEP_SUMMARY);
      await assert.rejects(writeReleasePreview(env));
      assert.deepEqual(await readFile(env.PLAN_PATH), before);
    });
  }
  await workspace(async env => {
    const artifact = await writeReleasePreview(env);
    const summary = await readFile(env.GITHUB_STEP_SUMMARY);
    const full = await readFile(artifact);
    await assert.rejects(writeReleasePreview(env), { code: 'EEXIST' });
    assert.deepEqual(await readFile(env.GITHUB_STEP_SUMMARY), summary);
    assert.deepEqual(await readFile(artifact), full);
  });
});

test('CLI exits nonzero for invalid JSON, missing context and unexpected arguments', async () => {
  await workspace(async (env, dir) => {
    const script = join(__dirname, 'release-rehearsal-summary.mjs');
    for (const [override, args] of [
      [{ SOURCE_SHA: 'main' }, []],
      [{ GITHUB_REPOSITORY: '' }, []],
      [{}, ['unexpected']],
    ]) {
      const result = spawnSync(process.execPath, [script, ...args], {
        env: { ...process.env, ...env, ...override },
        encoding: 'utf8',
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^release-rehearsal-summary: /);
    }
    await writeFile(env.PLAN_PATH, '{"invalid":');
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.deepEqual(await readdir(dir), ['plan.json']);
  });
});
