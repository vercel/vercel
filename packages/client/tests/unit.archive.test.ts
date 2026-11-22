import fs from 'fs-extra';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import tar from 'tar-fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectDeploymentFiles } from '../src/collect-deployment-files';
import { createTgzFiles } from '../src/utils/archive';
import type { FilesMap } from '../src/utils/hashes';

describe('deployment archives', () => {
  let tempPath: string;
  let cwd: string;

  beforeEach(async () => {
    tempPath = await fs.mkdtemp(join(tmpdir(), 'vercel-client-archive-'));
    cwd = join(tempPath, 'project');
    await fs.outputFile(join(cwd, 'index.txt'), 'hello');
  });

  afterEach(async () => {
    await fs.remove(tempPath);
  });

  async function archiveEntries(files: FilesMap) {
    const entries: { name: string; type: string }[] = [];
    const destination = await fs.mkdtemp(join(tempPath, 'extracted-'));
    await pipeline(
      Readable.from([...files.values()].map(file => file.data!)),
      createGunzip(),
      tar.extract(destination, {
        map(header) {
          entries.push({ name: header.name, type: header.type });
          return header;
        },
      })
    );
    return entries;
  }

  it.each([
    'audit/**',
    'audit/*',
    'audit/',
  ])('does not archive files excluded by %s', async pattern => {
    await fs.outputFile(join(cwd, '.vercelignore'), pattern);
    await fs.outputFile(join(cwd, 'audit', 'private.txt'), 'private');
    await fs.outputFile(join(cwd, 'audit', 'nested', 'private.txt'), 'private');

    const normal = await collectDeploymentFiles(cwd, {}, () => {});
    const archived = await collectDeploymentFiles(
      cwd,
      { archive: 'tgz' },
      () => {}
    );
    const entries = await archiveEntries(archived.filesMap);
    const files = entries
      .filter(entry => entry.type === 'file')
      .map(entry => entry.name)
      .sort();

    expect(files).toEqual(['.vercelignore', 'index.txt']);
    expect(files).toEqual(
      [...normal.filesMap]
        .filter(([sha]) => sha !== undefined)
        .flatMap(([, file]) => file.names.map(name => relative(cwd, name)))
        .sort()
    );
  });

  it('preserves re-included files and empty directories', async () => {
    await fs.outputFile(
      join(cwd, '.vercelignore'),
      'audit/**\n!audit/keep.txt'
    );
    await fs.outputFile(join(cwd, 'audit', 'keep.txt'), 'keep');
    await fs.outputFile(join(cwd, 'audit', 'private.txt'), 'private');
    await fs.ensureDir(join(cwd, 'empty'));

    const { filesMap } = await collectDeploymentFiles(
      cwd,
      { archive: 'tgz' },
      () => {}
    );
    const entries = await archiveEntries(filesMap);
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: 'audit/keep.txt', type: 'file' },
        { name: 'empty', type: 'directory' },
        { name: 'index.txt', type: 'file' },
      ])
    );
    expect(entries.map(entry => entry.name)).not.toContain('audit/private.txt');
  });

  it('only packs explicitly selected entries, honoring exclusions', async () => {
    const directory = join(cwd, 'audit');
    const excluded = join(directory, 'private.txt');
    const included = join(directory, 'keep.txt');
    await fs.outputFile(excluded, 'private');
    await fs.outputFile(included, 'keep');

    const filesMap = await createTgzFiles(
      cwd,
      [directory, excluded, included],
      undefined,
      [excluded]
    );
    expect(
      (await archiveEntries(filesMap)).map(entry => entry.name).sort()
    ).toEqual(['audit', 'audit/keep.txt']);
  });
});
