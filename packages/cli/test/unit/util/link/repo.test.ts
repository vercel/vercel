import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  findProjectsFromPath,
  findRepoRoot,
  RepoProjectConfig,
  traverseUpDirectories,
} from '../../../../src/util/link/repo';
import { client } from '../../../mocks/client';

const isWindows = process.platform === 'win32';

// Root of `vercel/vercel` repo
const vercelRepoRoot = join(__dirname, '../../../../../..');

describe('findRepoRoot()', () => {
  it('should find Git repo root from root', async () => {
    const repoRoot = await findRepoRoot(client, vercelRepoRoot);
    expect(repoRoot).toEqual(vercelRepoRoot);
  });

  it('should find Git repo root sub directory', async () => {
    const repoRoot = await findRepoRoot(client, __dirname);
    expect(repoRoot).toEqual(vercelRepoRoot);
  });

  it('should return `undefined` when no Git root found', async () => {
    const repoRoot = await findRepoRoot(client, tmpdir());
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

describe('findProjectsFromPath()', () => {
  const projects: RepoProjectConfig[] = [
    { id: 'root', name: 'r', directory: '.' },
    { id: 'site', name: 'a', directory: 'apps/site' },
    { id: 'site2', name: 'a', directory: 'apps/site2' },
    { id: 'other', name: 'b', directory: 'apps/other' },
    { id: 'duplicate', name: 'd', directory: 'apps/other' },
    { id: 'nested', name: 'n', directory: 'apps/other/nested' },
  ];

  it.each([
    { ids: ['root'], path: '.' },
    { ids: ['root'], path: 'lib' },
    { ids: ['root'], path: 'lib' },
    { ids: ['site'], path: `apps${sep}site` },
    { ids: ['site'], path: `apps${sep}site` },
    { ids: ['site'], path: `apps${sep}site${sep}components` },
    { ids: ['site2'], path: `apps${sep}site2` },
    { ids: ['site2'], path: `apps${sep}site2${sep}inner` },
    { ids: ['other', 'duplicate'], path: `apps${sep}other` },
    { ids: ['other', 'duplicate'], path: `apps${sep}other${sep}lib` },
    { ids: ['nested'], path: `apps${sep}other${sep}nested` },
    { ids: ['nested'], path: `apps${sep}other${sep}nested${sep}foo` },
  ])('should find Project "$id" for path "$path"', ({ path, ids }) => {
    const actual = findProjectsFromPath(projects, path);
    expect(actual.map(a => a.id)).toEqual(ids);
  });

  it('should return empty array when there are no matching Projects', () => {
    const actual = findProjectsFromPath([projects[1]], '.');
    expect(actual).toHaveLength(0);
  });
});
