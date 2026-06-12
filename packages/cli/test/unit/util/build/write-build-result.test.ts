import { join } from 'path';
import { glob, FileBlob, FileFsRef } from '@vercel/build-utils';
import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { filesWithoutFsRefs } from '../../../../src/util/build/write-build-result';

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

  it('should omit external symlinks from standalone shared output', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const root = await fs.mkdtemp(join(__dirname, 'standalone-symlink-'));
    const pnpmStore = join(
      root,
      'node_modules/.pnpm/next@1.0.0/node_modules/next'
    );
    const appNodeModules = join(root, 'apps/web/node_modules');
    const sharedDest = join(root, 'apps/web/.vercel/output/shared');

    await fs.mkdirp(pnpmStore);
    await fs.writeFile(join(pnpmStore, 'server.js'), 'module.exports = {}');
    await fs.mkdirp(appNodeModules);
    await fs.symlink(
      '../../../node_modules/.pnpm/next@1.0.0/node_modules/next',
      join(appNodeModules, 'next')
    );

    const tracedFile = await FileFsRef.fromFsPath({
      fsPath: join(appNodeModules, 'next/server.js'),
    });
    const externalSymlink = await FileFsRef.fromFsPath({
      fsPath: join(appNodeModules, 'next'),
    });

    const { shared = {}, filePathMap = {} } = filesWithoutFsRefs(
      {
        'node_modules/next': externalSymlink,
        'node_modules/next/server.js': tracedFile,
      },
      root,
      sharedDest,
      true
    );

    expect(shared['node_modules/next']).toBeUndefined();
    expect(shared['node_modules/next/server.js']).toBeDefined();
    expect(filePathMap['node_modules/next']).toBeUndefined();
    expect(filePathMap['node_modules/next/server.js']).toEqual(
      'apps/web/.vercel/output/shared/node_modules/next/server.js'
    );

    await fs.remove(root);
  });

  it('re-anchors standalone keys that escape the function root', async () => {
    // Mirrors a `vc build --standalone` from a monorepo subdirectory: the
    // repo root is detected as the app dir while dependencies are hoisted two
    // levels up, so the builder emits keys like `../../node_modules/...`.
    const repoRootPath = join(__dirname, 'app-dir');
    const sharedDest = join(repoRootPath, '.vercel/output/shared');
    const fsPath = join(__filename); // any real file works as the byte source

    const escapingKey =
      '../../node_modules/.pnpm/next@1.0.0/node_modules/next/dist/server.js';
    const {
      files,
      filePathMap = {},
      shared = {},
    } = filesWithoutFsRefs(
      { [escapingKey]: new FileFsRef({ fsPath }) },
      repoRootPath,
      sharedDest,
      true
    );

    // The FileFsRef is removed from `files` and the escaping key is gone.
    expect(files[escapingKey]).toBeUndefined();
    expect(Object.keys(filePathMap)).not.toContain(escapingKey);

    // It is re-anchored inside the function root (no leading `..`).
    const anchoredKey =
      'node_modules/.pnpm/next@1.0.0/node_modules/next/dist/server.js';
    expect(Object.keys(filePathMap)).toEqual([anchoredKey]);
    expect(filePathMap[anchoredKey]).not.toContain('..');

    // The shared bytes are placed under the same anchored key, and the
    // recorded value points at them (relative to the repo root).
    expect(shared[anchoredKey]).toBeDefined();
    expect(filePathMap[anchoredKey]).toEqual(
      `.vercel/output/shared/${anchoredKey}`
    );
  });
});
