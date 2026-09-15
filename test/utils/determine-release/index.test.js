import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  determineRelease,
  readChangesetState,
} from '../../../utils/determine-release.mjs';

const tempDirs = [];

/**
 * Build a minimal repo shaped like ours: a .changeset directory (with the
 * README/config that must never count as changesets) and packages/cli.
 */
async function createFixture({
  changesets = {},
  preJson,
  cliVersion = '1.2.3',
} = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'determine-release-'));
  tempDirs.push(cwd);

  await mkdir(join(cwd, '.changeset'), { recursive: true });
  await mkdir(join(cwd, 'packages', 'cli'), { recursive: true });
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify({
      name: 'fixture-root',
      private: true,
      workspaces: ['packages/*'],
    })
  );
  await writeFile(
    join(cwd, 'packages', 'cli', 'package.json'),
    JSON.stringify({ name: 'vercel', version: cliVersion })
  );
  await writeFile(join(cwd, '.changeset', 'README.md'), '# changesets\n');
  await writeFile(
    join(cwd, '.changeset', 'config.json'),
    JSON.stringify({ baseBranch: 'main' })
  );

  for (const [name, contents] of Object.entries(changesets)) {
    await writeFile(join(cwd, '.changeset', name), contents);
  }
  if (preJson) {
    await writeFile(
      join(cwd, '.changeset', 'pre.json'),
      JSON.stringify(preJson)
    );
  }

  return cwd;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))
  );
});

const neverPublished = async () => false;
const alwaysPublished = async () => true;

// Realistic changeset bodies, matching how this repo writes them.
const EMPTY = '---\n---\n\nUpdated CI workflow configuration.\n';
const CLI_PATCH = "---\n'vercel': patch\n---\n\nFixed an edge case.\n";
const CLI_MINOR = "---\n'vercel': minor\n---\n\nAdded a flag.\n";
const NODE_PATCH = "---\n'@vercel/node': patch\n---\n\nFixed bundling.\n";
const MULTI =
  "---\n'@vercel/node': minor\n'@vercel/build-utils': patch\n---\n\nTwo packages.\n";

describe('readChangesetState', () => {
  it('ignores README.md and config.json', async () => {
    const cwd = await createFixture();
    const { changesets } = await readChangesetState(cwd);
    expect(changesets).toEqual([]);
  });

  it('reads pending changesets with their releases', async () => {
    const cwd = await createFixture({
      changesets: {
        'happy-cats-dance.md': "---\n'vercel': patch\n---\n\nFix\n",
      },
    });
    const { changesets } = await readChangesetState(cwd);
    expect(changesets).toHaveLength(1);
    expect(changesets[0].id).toEqual('happy-cats-dance');
    expect(changesets[0].releases).toEqual([{ name: 'vercel', type: 'patch' }]);
  });

  it('treats empty frontmatter as zero releases', async () => {
    const cwd = await createFixture({
      changesets: { 'ci-tweak.md': '---\n---\n\nCI only change\n' },
    });
    const { changesets } = await readChangesetState(cwd);
    expect(changesets).toHaveLength(1);
    expect(changesets[0].releases).toEqual([]);
  });

  it('reads multiple packages from one changeset', async () => {
    const cwd = await createFixture({ changesets: { 'multi.md': MULTI } });
    const { changesets } = await readChangesetState(cwd);
    expect(changesets[0].releases).toEqual([
      { name: '@vercel/node', type: 'minor' },
      { name: '@vercel/build-utils', type: 'patch' },
    ]);
  });

  // A malformed changeset must fail the determine job rather than parse as
  // "zero changesets", which would wrongly look like a publish.
  it.each([
    ['a file with no frontmatter', 'Just a summary, no frontmatter.\n'],
    ['an empty file', ''],
  ])('throws on %s', async (_label, body) => {
    const cwd = await createFixture({ changesets: { 'broken.md': body } });
    await expect(readChangesetState(cwd)).rejects.toThrow(
      /could not parse changeset/
    );
  });

  // Pre mode changes which changesets count as pending. We deliberately do not
  // reimplement that filtering, so detection must refuse to guess.
  it('hard fails when the repo is in pre mode', async () => {
    const cwd = await createFixture({
      changesets: {
        'already-out.md': "---\n'vercel': patch\n---\n\nFix\n",
      },
      preJson: {
        mode: 'pre',
        tag: 'next',
        initialVersions: {},
        changesets: ['already-out'],
      },
    });
    await expect(readChangesetState(cwd)).rejects.toThrow(/pre mode/);
  });
});

describe('determineRelease', () => {
  it('does not publish while changesets are pending', async () => {
    const cwd = await createFixture({
      changesets: {
        'happy-cats-dance.md': "---\n'vercel': patch\n---\n\nFix\n",
      },
    });
    const result = await determineRelease({ cwd, isPublished: neverPublished });
    expect(result.willPublish).toBe(false);
    expect(result.shouldReleaseBinary).toBe(false);
    expect(result.pendingChangesets).toEqual(['happy-cats-dance']);
  });

  it('does not publish when only empty changesets are pending', async () => {
    const cwd = await createFixture({
      changesets: { 'ci-tweak.md': '---\n---\n\nCI only\n' },
    });
    const result = await determineRelease({ cwd, isPublished: neverPublished });
    expect(result.willPublish).toBe(false);
    expect(result.shouldReleaseBinary).toBe(false);
    expect(result.reason).toMatch(/empty frontmatter/);
  });

  // This is the regression the old npm-only check got wrong: a feature push
  // while the release PR is open reports the committed version as unpublished.
  it('skips the binary for a feature push even when the cli version is not on npm', async () => {
    const cwd = await createFixture({
      cliVersion: '99.99.99',
      changesets: {
        'happy-cats-dance.md': "---\n'vercel': patch\n---\n\nFix\n",
      },
    });
    const isPublished = async () => {
      throw new Error(
        'npm should not be consulted while changesets are pending'
      );
    };
    const result = await determineRelease({ cwd, isPublished });
    expect(result.shouldReleaseBinary).toBe(false);
    expect(result.cliPublished).toBeNull();
  });

  it('releases the binary when no changesets remain and vercel is unpublished', async () => {
    const cwd = await createFixture({ cliVersion: '52.0.0' });
    const result = await determineRelease({ cwd, isPublished: neverPublished });
    expect(result.willPublish).toBe(true);
    expect(result.shouldReleaseBinary).toBe(true);
    expect(result.cliVersion).toEqual('52.0.0');
  });

  it('skips the binary when the publish does not include vercel', async () => {
    const cwd = await createFixture({ cliVersion: '52.0.0' });
    const result = await determineRelease({
      cwd,
      isPublished: alwaysPublished,
    });
    expect(result.willPublish).toBe(true);
    expect(result.shouldReleaseBinary).toBe(false);
    expect(result.cliPublished).toBe(true);
  });

  it('refuses to decide in pre mode rather than miscounting', async () => {
    const cwd = await createFixture({
      changesets: {
        'already-out.md': "---\n'vercel': patch\n---\n\nFix\n",
      },
      preJson: {
        mode: 'pre',
        tag: 'next',
        initialVersions: {},
        changesets: ['already-out'],
      },
    });
    await expect(
      determineRelease({ cwd, isPublished: neverPublished })
    ).rejects.toThrow(/pre mode/);
  });
});

// One row per shape of .changeset that can land on main. `binary` is the only
// value the workflow gates on.
describe.each([
  {
    label: 'Version Packages merge (no changesets left)',
    changesets: {},
    publish: true,
    binary: true,
  },
  {
    label: 'single cli patch pending',
    changesets: { 'cli-patch.md': CLI_PATCH },
    publish: false,
    binary: false,
  },
  {
    label: 'single non-cli patch pending',
    changesets: { 'node-patch.md': NODE_PATCH },
    publish: false,
    binary: false,
  },
  {
    label: 'several non-empty changesets pending',
    changesets: {
      'cli-minor.md': CLI_MINOR,
      'node-patch.md': NODE_PATCH,
      'multi.md': MULTI,
    },
    publish: false,
    binary: false,
  },
  {
    label: 'only an empty changeset pending',
    changesets: { 'ci.md': EMPTY },
    publish: false,
    binary: false,
  },
  {
    label: 'several empty changesets pending',
    changesets: { 'ci.md': EMPTY, 'docs.md': EMPTY },
    publish: false,
    binary: false,
  },
  {
    label: 'empty changeset alongside a real one',
    changesets: { 'ci.md': EMPTY, 'cli-patch.md': CLI_PATCH },
    publish: false,
    binary: false,
  },
])('case matrix: $label', ({ changesets, publish, binary }) => {
  it(`willPublish=${publish}, shouldReleaseBinary=${binary}`, async () => {
    const cwd = await createFixture({ changesets });
    const result = await determineRelease({ cwd, isPublished: neverPublished });
    expect(result.willPublish).toBe(publish);
    expect(result.shouldReleaseBinary).toBe(binary);
  });
});

// Guard against drift from changesets/action's own decision. This mirrors the
// `switch (true)` in its src/index.ts: it runs the publish script only when
// there are zero pending changesets. Every other shape either opens the Version
// Packages PR or does nothing, and neither publishes.
describe('parity with changesets/action', () => {
  function actionRunsPublishScript(changesets, hasPublishScript = true) {
    const hasChangesets = changesets.length !== 0;
    const hasNonEmptyChangesets = changesets.some(
      changeset => changeset.releases.length > 0
    );

    switch (true) {
      case !hasChangesets && !hasPublishScript:
        return false; // does nothing
      case !hasChangesets && hasPublishScript:
        return true; // publishes
      case hasChangesets && !hasNonEmptyChangesets:
        return false; // all empty; no PR, no publish
      default:
        return false; // version PR
    }
  }

  it.each([
    { label: 'none at all', changesets: {} },
    { label: 'only empty', changesets: { 'ci.md': EMPTY } },
    { label: 'two empty', changesets: { 'ci.md': EMPTY, 'docs.md': EMPTY } },
    {
      label: 'mixed empty and non-empty',
      changesets: { 'ci.md': EMPTY, 'cli-patch.md': CLI_PATCH },
    },
    { label: 'only non-empty', changesets: { 'cli-patch.md': CLI_PATCH } },
    {
      label: 'multi-package changeset',
      changesets: { 'multi.md': MULTI },
    },
  ])('agrees for $label', async ({ changesets }) => {
    const cwd = await createFixture({ changesets });
    const { changesets: parsed } = await readChangesetState(cwd);
    const result = await determineRelease({ cwd, isPublished: neverPublished });
    expect(result.willPublish).toBe(actionRunsPublishScript(parsed));
  });
});

describe('this repository', () => {
  it('matches the current .changeset state', async () => {
    const result = await determineRelease({ isPublished: neverPublished });
    const { changesets } = await readChangesetState();
    expect(result.willPublish).toBe(changesets.length === 0);
    expect(result.pendingChangesets.sort()).toEqual(
      changesets.map(c => c.id).sort()
    );
  });
});
