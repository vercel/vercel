import { join, resolve } from 'path';
import { buildFileTree } from '../src/utils';

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
    const { fileList, ignoreList } = await buildFileTree(cwd, true, noop);

    const expectedFileList = toAbsolutePaths(cwd, ['.nowignore', 'index.txt']);
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

  it('should include the node_modules using `.vercelignore` allowlist', async () => {
    const cwd = fixture('vercelignore-allow-nodemodules');
    const { fileList, ignoreList } = await buildFileTree(cwd, true, noop);

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

  it('should find root files but ignore .output files when prebuilt=false', async () => {
    const cwd = fixture('file-system-api');
    const prebuilt = false;
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      true,
      noop,
      prebuilt
    );

    const expectedFileList = toAbsolutePaths(cwd, ['foo.txt', 'sub/bar.txt']);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['.output'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should find .output files but ignore other files when prebuilt=true', async () => {
    const cwd = fixture('file-system-api');
    const prebuilt = true;
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      true,
      noop,
      prebuilt
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      '.output/baz.txt',
      '.output/sub/qux.txt',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['foo.txt', 'sub'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });
});
