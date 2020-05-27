import path from 'path';
import { buildFileTree, getVercelIgnore, readdirRelative } from '../src/utils';

const ignoreFixturePath = path.resolve(__dirname, 'fixtures', 'nowignore');

const normalizeWindowsPaths = (files: string[]) => {
  if (process.platform === 'win32') {
    return files.map(f => f.replace(/\\/g, '/'));
  }
  return files;
};

describe('buildFileTree', () => {
  it('will include the correct files', async () => {
    const expected = [
      'tests/fixtures/nowignore/.nowignore',
      'tests/fixtures/nowignore/index.txt',
    ].map(p => path.join(process.cwd(), p));
    const actual = await buildFileTree(ignoreFixturePath, true, () => {});
    expect(normalizeWindowsPaths(expected).sort()).toEqual(
      normalizeWindowsPaths(actual).sort()
    );
  });
});

describe('readdirRelative', () => {
  it('will ignore the hardcoded default ignores', async () => {
    // most importantly, this method should not walk/include node_modules
    const expected = [
      'tests/fixtures/nowignore/.nowignore',
      'tests/fixtures/nowignore/ignore.txt',
      'tests/fixtures/nowignore/index.txt',
      'tests/fixtures/nowignore/folder/ignore.txt',
    ];
    const { ignores } = await getVercelIgnore(ignoreFixturePath);
    const actual = await readdirRelative(
      ignoreFixturePath,
      ignores,
      process.cwd()
    );
    expect(normalizeWindowsPaths(expected).sort()).toEqual(
      normalizeWindowsPaths(actual).sort()
    );
  });
});
