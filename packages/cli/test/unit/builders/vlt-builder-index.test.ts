import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';
import { remove } from 'fs-extra';
import {
  createVltBuilderImporter,
  type EmbeddedBuilderGraphs,
  type EmbeddedBuilderIndex,
} from '../../../src/builders/vlt-builder-importer';

const require_ = createRequire(__filename);
const NAME = '@vercel/fake-builder';
const HASH = 'a'.repeat(64);

const index: EmbeddedBuilderIndex = {
  schemaVersion: 1,
  builders: { [NAME]: { hash: HASH, version: '1.2.3' } },
};

async function installFakeBuilder(cacheRoot: string, marker = HASH) {
  const root = join(cacheRoot, HASH);
  const pkgDir = join(root, 'node_modules', '@vercel', 'fake-builder');
  await mkdir(pkgDir, { recursive: true });
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: NAME, version: '1.2.3', main: 'index.js' })
  );
  await writeFile(
    join(pkgDir, 'index.js'),
    'module.exports = { version: 3, build: () => "fake" };'
  );
  await writeFile(join(root, '.vercel-builder-graph'), `${marker}\n`);
}

describe('vlt Builder importer index', () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await getWriteableDirectory();
  });

  afterEach(async () => {
    await remove(cacheRoot);
  });

  it('imports an installed Builder without loading the graphs', async () => {
    await installFakeBuilder(cacheRoot);
    const loadGraphs = vi.fn(async () => {
      throw new Error('graphs must not load for an installed Builder');
    });
    const importBuilders = createVltBuilderImporter({
      loadIndex: async () => index,
      loadGraphs,
      require: require_,
      cacheRoot,
    });

    const builders = await importBuilders(new Map([[NAME, NAME]]));

    const loaded = builders.get(NAME);
    expect(loaded?.pkg.version).toBe('1.2.3');
    expect(loaded?.builder.build({} as never)).toBe('fake');
    expect(loaded?.path).toContain(join(cacheRoot, HASH));
    expect(loadGraphs).not.toHaveBeenCalled();
  });

  it('loads the graphs to install when the marker does not match', async () => {
    await installFakeBuilder(cacheRoot, 'stale');
    const loadGraphs = vi.fn(async () => {
      throw new Error('graphs requested');
    });
    const importBuilders = createVltBuilderImporter({
      loadIndex: async () => index,
      loadGraphs,
      require: require_,
      cacheRoot,
    });

    await expect(importBuilders(new Map([[NAME, NAME]]))).rejects.toThrow(
      'graphs requested'
    );
    expect(loadGraphs).toHaveBeenCalledTimes(1);
  });

  it('refuses to install when the index and graph disagree', async () => {
    const graphs = {
      schemaVersion: 1,
      builders: { [NAME]: { hash: 'b'.repeat(64), version: '1.2.3' } },
    } as unknown as EmbeddedBuilderGraphs;
    const importBuilders = createVltBuilderImporter({
      loadIndex: async () => index,
      loadGraphs: async () => graphs,
      require: require_,
      cacheRoot,
    });

    await expect(importBuilders(new Map([[NAME, NAME]]))).rejects.toThrow(
      `The embedded vlt Builder index does not match the graph for ${NAME}.`
    );
  });

  it('rejects a Builder missing from the index', async () => {
    const importBuilders = createVltBuilderImporter({
      loadIndex: async () => index,
      require: require_,
      cacheRoot,
    });

    await expect(
      importBuilders(new Map([['@vercel/other', '@vercel/other']]))
    ).rejects.toThrow('No pinned vlt graph exists for @vercel/other.');
  });
});
