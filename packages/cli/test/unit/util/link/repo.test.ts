import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  findProjectFromPath,
  findRepoRoot,
  RepoProjectConfig,
  traverseUpDirectories,
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

describe('traverseUpDirectories()', () => {
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
    expect(Array.from(traverseUpDirectories(input))).toEqual(expected);
  });
});

describe('findProjectFromPath()', () => {
  const projects: RepoProjectConfig[] = [
    { id: 'root', name: 'r', directory: '.' },
    { id: 'site', name: 'a', directory: 'apps/site' },
    { id: 'site2', name: 'a', directory: 'apps/site2' },
    { id: 'other', name: 'b', directory: 'apps/other' },
    { id: 'nested', name: 'n', directory: 'apps/other/nested' },
  ];

  it.each([
    { id: 'root', path: '.' },
    { id: 'root', path: 'lib' },
    { id: 'root', path: 'lib' },
    { id: 'site', path: `apps${sep}site` },
    { id: 'site', path: `apps${sep}site` },
    { id: 'site', path: `apps${sep}site${sep}components` },
    { id: 'site2', path: `apps${sep}site2` },
    { id: 'site2', path: `apps${sep}site2${sep}inner` },
    { id: 'other', path: `apps${sep}other` },
    { id: 'other', path: `apps${sep}other${sep}lib` },
    { id: 'nested', path: `apps${sep}other${sep}nested` },
    { id: 'nested', path: `apps${sep}other${sep}nested${sep}foo` },
  ])('should find Project "$id" for path "$path"', ({ path, id }) => {
    const actual = findProjectFromPath(projects, path);
    expect(actual?.id).toEqual(id);
  });

  it('should return `undefined` when there are no matching Projects', () => {
    const actual = findProjectFromPath([projects[1]], '.');
    expect(actual).toBeUndefined();
  });
});
