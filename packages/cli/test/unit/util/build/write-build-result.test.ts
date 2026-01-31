import { tmpdir } from 'node:os';
import { join } from 'path';
import fs from 'fs-extra';
import { glob, FileBlob, FileFsRef } from '@vercel/build-utils';
import { describe, expect, it, afterAll } from 'vitest';
import {
  filesWithoutFsRefs,
  writeStaticFile,
  writeBuildResult,
  type PathOverride,
} from '../../../../src/util/build/write-build-result';

describe('filesWithoutFsRefs()', () => {
  it('should create `filePathMap` with normalized POSIX paths', async () => {
    const repoRootPath = join(
      __dirname,
      '../../../fixtures/unit/commands/build/monorepo'
    );
    const input = {
      ...(await glob('**', repoRootPath)),
      'blob-file.txt': new FileBlob({ data: 'blob file' }),
    };
    const { files, filePathMap = {} } = await filesWithoutFsRefs(
      input,
      repoRootPath
    );

    // Only the "blob-file.txt" file should be in the `files` object
    expect(Object.keys(files)).toHaveLength(1);
    expect(files['blob-file.txt']).toEqual(input['blob-file.txt']);

    // The `filePathMap` should have normalized POSIX paths, even on Windows
    expect(Object.keys(filePathMap)).not.contain('blob-file.txt');
    expect(filePathMap['apps/nextjs/.gitignore']).toEqual(
      'apps/nextjs/.gitignore'
    );
    expect(filePathMap['apps/nextjs/next.config.js']).toEqual(
      'apps/nextjs/next.config.js'
    );
    expect(filePathMap['apps/nextjs/package.json']).toEqual(
      'apps/nextjs/package.json'
    );
    expect(filePathMap['apps/nextjs/pages/index.jsx']).toEqual(
      'apps/nextjs/pages/index.jsx'
    );
    expect(filePathMap['package-lock.json']).toEqual('package-lock.json');
    expect(filePathMap['package.json']).toEqual('package.json');
  });
});

describe('writeStaticFile()', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await fs.remove(dir);
    }
  });

  it('should write regular files to static directory', async () => {
    const outputDir = join(tmpdir(), `test-static-${Date.now()}`);
    tempDirs.push(outputDir);

    const file = new FileBlob({ data: 'test content' });
    const overrides: Record<string, PathOverride> = {};

    await writeStaticFile(outputDir, file, 'test.txt', overrides);

    const dest = join(outputDir, 'static', 'test.txt');
    expect(await fs.pathExists(dest)).toBe(true);
    expect(await fs.readFile(dest, 'utf8')).toBe('test content');
  });

  it('should write immutable files to immutable directory', async () => {
    const outputDir = join(tmpdir(), `test-immutable-${Date.now()}`);
    tempDirs.push(outputDir);

    const file = new FileBlob({ data: 'immutable content', immutable: true });
    const overrides: Record<string, PathOverride> = {};

    await writeStaticFile(outputDir, file, 'immutable.js', overrides);

    const staticDest = join(outputDir, 'static', 'immutable.js');
    const immutableDest = join(outputDir, 'immutable', 'immutable.js');

    expect(await fs.pathExists(staticDest)).toBe(false);
    expect(await fs.pathExists(immutableDest)).toBe(true);
    expect(await fs.readFile(immutableDest, 'utf8')).toBe('immutable content');
  });

  it('should write FileFsRef with immutable flag to immutable directory', async () => {
    const outputDir = join(tmpdir(), `test-fsref-immutable-${Date.now()}`);
    tempDirs.push(outputDir);

    // Create a source file
    const sourceFile = join(outputDir, 'source.js');
    await fs.mkdirp(outputDir);
    await fs.writeFile(sourceFile, 'source content');

    const file = new FileFsRef({ fsPath: sourceFile, immutable: true });
    const overrides: Record<string, PathOverride> = {};

    await writeStaticFile(outputDir, file, 'dest.js', overrides);

    const immutableDest = join(outputDir, 'immutable', 'dest.js');
    expect(await fs.pathExists(immutableDest)).toBe(true);
  });
});

describe('writeBuildResult()', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await fs.remove(dir);
    }
  });

  it('should write immutable files to immutable directory in v2 build result', async () => {
    const outputDir = join(tmpdir(), `test-build-result-${Date.now()}`);
    const repoRootPath = outputDir;
    const workPath = outputDir;
    tempDirs.push(outputDir);
    await fs.mkdirp(outputDir);

    const buildResult = {
      output: {
        'static/regular.js': new FileBlob({ data: 'regular content' }),
        'static/immutable.js': new FileBlob({
          data: 'immutable content',
          immutable: true,
        }),
      },
    };

    await writeBuildResult({
      repoRootPath,
      outputDir,
      buildResult,
      build: { src: 'package.json', use: '@vercel/static' },
      builder: { version: 2, build: async () => ({ output: {} }) },
      builderPkg: { name: '@vercel/static', version: '1.0.0' },
      vercelConfig: null,
      standalone: false,
      workPath,
    });

    // Regular file should be in static/
    const staticDest = join(outputDir, 'static', 'static/regular.js');
    expect(await fs.pathExists(staticDest)).toBe(true);

    // Immutable file should be in immutable/
    const immutableDest = join(outputDir, 'immutable', 'static/immutable.js');
    expect(await fs.pathExists(immutableDest)).toBe(true);

    // Immutable file should NOT be in static/
    const wrongDest = join(outputDir, 'static', 'static/immutable.js');
    expect(await fs.pathExists(wrongDest)).toBe(false);
  });
});
