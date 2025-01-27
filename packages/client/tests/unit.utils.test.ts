import { join, resolve } from 'path';
import fs from 'fs-extra';
import { buildFileTree } from '../src/utils';
import { describe, expect, it } from 'vitest';

const fixture = (name: string) => resolve(__dirname, 'fixtures', name);
const noop = () => {};

const normalizeWindowsPaths = (files: string[]) => {
  if (process.platform === 'win32') {
    return files.map(f => f.replace(/\\/g, '/'));
  }
  return files;
};

const toAbsolutePaths = (cwd: string, files: string[]) =>
  files.map(p => join(cwd, p));

describe('buildFileTree()', () => {
  it('should exclude files using `.nowignore` blocklist', async () => {
    const cwd = fixture('nowignore');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      '.nowignore',
      'folder',
      'index.txt',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = [
      'ignore.txt',
      'folder/ignore.txt',
      'node_modules',
    ];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should include symlinked files and directories', async () => {
    const cwd = fixture('symlinks');

    // Also add an empty directory to make sure it's included
    await fs.mkdirp(join(cwd, 'empty'));

    const { fileList } = await buildFileTree(cwd, { isDirectory: true }, noop);

    const expectedFileList = toAbsolutePaths(cwd, [
      'empty',
      'folder-link',
      'folder/text.txt',
      'index.txt',
      'index-link.txt',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const [folderLinkPath, indexLinkPath] = await Promise.all([
      fs.lstat(join(cwd, 'folder-link')),
      fs.lstat(join(cwd, 'index-link.txt')),
    ]);
    expect(folderLinkPath.isSymbolicLink());
    expect(folderLinkPath.isDirectory());
    expect(indexLinkPath.isSymbolicLink());
  });

  it('should include the node_modules using `.vercelignore` allowlist', async () => {
    const cwd = fixture('vercelignore-allow-nodemodules');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true },
      noop
    );

    const expected = toAbsolutePaths(cwd, [
      'node_modules/one.txt',
      'sub/node_modules/two.txt',
      'sub/include.txt',
      '.vercelignore',
      'hello.txt',
    ]);
    expect(normalizeWindowsPaths(expected).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['.env.local', 'exclude.txt'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should find root files but ignore `.vercel/output` files when prebuilt=false', async () => {
    const cwd = fixture('file-system-api');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true, prebuilt: false },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, ['foo.txt', 'sub/bar.txt']);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['.gitignore', '.vercel'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should find `.vercel/output` files but ignore other files when prebuilt=true', async () => {
    const cwd = fixture('file-system-api');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, '.vercel/output'),
      },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      '.vercel/output/functions/api/another.func/.vc-config.json',
      '.vercel/output/functions/api/example.func/.vc-config.json',
      '.vercel/output/static/baz.txt',
      '.vercel/output/static/sub/qux.txt',
      'node_modules/another/index.js',
      'node_modules/example/index.js',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['.gitignore', 'foo.txt', 'sub'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('monorepo - should find root files but ignore `.vercel/output` files when prebuilt=false', async () => {
    const cwd = fixture('monorepo-boa');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true, prebuilt: false },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      'foo.txt',
      'sub/bar.txt',
      'apps/blog/foo.txt',
      'apps/blog/sub/bar.txt',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['apps/blog/.gitignore', 'apps/blog/.vercel'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('monorepo - should find `.vercel/output` files but ignore other files when prebuilt=true', async () => {
    const cwd = fixture('monorepo-boa');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, 'apps/blog/.vercel/output'),
      },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      'apps/blog/.vercel/output/functions/api/another.func/.vc-config.json',
      'apps/blog/.vercel/output/functions/api/example.func/.vc-config.json',
      'apps/blog/.vercel/output/static/baz.txt',
      'apps/blog/.vercel/output/static/sub/qux.txt',
      'node_modules/another/index.js',
      'node_modules/example/index.js',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = [
      'apps/blog/.gitignore',
      'apps/blog/foo.txt',
      'apps/blog/sub',
      'foo.txt',
      'sub',
    ];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });
});
