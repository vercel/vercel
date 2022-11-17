import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findRepoRoot,
  traverseDirectories,
} from '../../../../src/util/link/repo';

const isWindows = process.platform === 'win32';

// Root of `vercel/vercel` repo
const vercelRepoRoot = join(__dirname, '../../../../../..');

describe('findRepoRoot()', () => {
  it('should find Git repo root from root', async () => {
    const repoRoot = await findRepoRoot(vercelRepoRoot);
    expect(repoRoot).toEqual(vercelRepoRoot);
  });

  it('should find Git repo root sub directory', async () => {
    const repoRoot = await findRepoRoot(__dirname);
    expect(repoRoot).toEqual(vercelRepoRoot);
  });

  it('should return `undefined` when no Git root found', async () => {
    const repoRoot = await findRepoRoot(tmpdir());
    expect(repoRoot).toEqual(undefined);
  });
});

describe('traverseDirectories()', () => {
  test.each(
    isWindows
      ? [
          {
            input: 'C:\\foo\\bar\\baz',
            expected: ['C:\\foo\\bar\\baz', 'C:\\foo\\bar', 'C:\\foo', 'C:\\'],
          },
          {
            input: 'C:\\foo\\..\\bar\\.\\baz',
            expected: ['C:\\bar\\baz', 'C:\\bar', 'C:\\'],
          },
        ]
      : [
          {
            input: '/foo/bar/baz',
            expected: ['/foo/bar/baz', '/foo/bar', '/foo', '/'],
          },
          {
            input: '/foo/../bar/./baz',
            expected: ['/bar/baz', '/bar', '/'],
          },
        ]
  )('should traverse "$input"', ({ input, expected }) => {
    expect(Array.from(traverseDirectories(input))).toEqual(expected);
  });
});
