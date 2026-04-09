import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import type { RepoProjectConfig } from '../../../../src/util/link/repo';
import {
  findProjectsFromPath,
  findRepoRoot,
  mergeRepoProjectEntries,
} from '../../../../src/util/link/repo';

// Root of `vercel/vercel` repo
const vercelRepoRoot = join(__dirname, '../../../../../..');

/**
 * Normalizes a path for comparison across platforms.
 * On Windows, git returns paths with forward slashes, but Node.js uses backslashes.
 */
function normalizePath(p: string | undefined): string | undefined {
  if (p === undefined) return undefined;
  return normalize(p);
}

describe('findRepoRoot()', () => {
  it('should find Git repo root from root', async () => {
    const repoRoot = await findRepoRoot(vercelRepoRoot);
    expect(normalizePath(repoRoot)).toEqual(normalizePath(vercelRepoRoot));
  });

  it('should find Git repo root sub directory', async () => {
    const repoRoot = await findRepoRoot(__dirname);
    expect(normalizePath(repoRoot)).toEqual(normalizePath(vercelRepoRoot));
  });

  it('should return `undefined` when no Git root found', async () => {
    const repoRoot = await findRepoRoot(tmpdir());
    expect(repoRoot).toEqual(undefined);
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

describe('mergeRepoProjectEntries()', () => {
  const teamA = 'team_a';

  it('replaces entries with same orgId and directory', () => {
    const existing: RepoProjectConfig[] = [
      { id: 'old', name: 'n1', directory: 'apps/web', orgId: teamA },
      { id: 'keep', name: 'other', directory: 'apps/api', orgId: teamA },
    ];
    const incoming: RepoProjectConfig[] = [
      { id: 'new', name: 'n1', directory: 'apps/web', orgId: teamA },
    ];
    const merged = mergeRepoProjectEntries(existing, incoming, undefined);
    expect(merged).toHaveLength(2);
    expect(merged.find(p => p.directory === 'apps/web')?.id).toBe('new');
    expect(merged.find(p => p.directory === 'apps/api')?.id).toBe('keep');
  });

  it('uses top-level orgId for key when row omits orgId', () => {
    const existing: RepoProjectConfig[] = [{ id: 'a', name: 'x', directory: '.' }];
    const incoming: RepoProjectConfig[] = [
      { id: 'b', name: 'y', directory: '.', orgId: teamA },
    ];
    const merged = mergeRepoProjectEntries(existing, incoming, teamA);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('b');
  });
});
