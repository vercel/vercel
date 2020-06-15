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

describe('buildFileTree', () => {
  it('should exclude files using `.nowignore` blocklist', async () => {
    const cwd = fixture('nowignore');
    const expected = toAbsolutePaths(cwd, ['.nowignore', 'index.txt']);
    const actual = await buildFileTree(cwd, true, noop);
    expect(normalizeWindowsPaths(expected).sort()).toEqual(
      normalizeWindowsPaths(actual).sort()
    );
  });

  it('should include the node_modules using `.vercelignore` allowlist', async () => {
    const cwd = fixture('vercelignore-allow-nodemodules');
    const expected = toAbsolutePaths(cwd, [
      'node_modules/one.txt',
      'sub/node_modules/two.txt',
      'sub/include.txt',
      '.vercelignore',
      'hello.txt',
    ]);
    const actual = await buildFileTree(cwd, true, noop);
    expect(normalizeWindowsPaths(expected).sort()).toEqual(
      normalizeWindowsPaths(actual).sort()
    );
  });
});
