import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import { mkdirp, writeJSON } from 'fs-extra';
import type { RepoProjectConfig } from '../../../../src/util/link/repo';
import {
  findProjectsFromPath,
  findRepoRoot,
  getRepoLink,
} from '../../../../src/util/link/repo';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

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

describe('getRepoLink()', () => {
  it('accepts `teamId` as an alias for `orgId`', async () => {
    const cwd = setupTmpDir('repo-json-team-id');
    await mkdirp(join(cwd, '.vercel'));
    await writeJSON(join(cwd, '.vercel/repo.json'), {
      teamId: 'team_top',
      remoteName: 'origin',
      projects: [
        { id: 'prj_a', name: 'a', directory: 'a', teamId: 'team_a' },
        { id: 'prj_b', name: 'b', directory: 'b' },
      ],
    });

    const repoLink = await getRepoLink(client, cwd);
    expect(repoLink?.repoConfig?.orgId).toEqual('team_top');
    expect(repoLink?.repoConfig?.projects[0].orgId).toEqual('team_a');
    expect(repoLink?.repoConfig?.projects[1].orgId).toBeUndefined();
  });

  it('throws when `orgId` and `teamId` conflict on a project', async () => {
    const cwd = setupTmpDir('repo-json-team-id-conflict');
    await mkdirp(join(cwd, '.vercel'));
    await writeJSON(join(cwd, '.vercel/repo.json'), {
      remoteName: 'origin',
      projects: [
        {
          id: 'prj_a',
          name: 'a',
          directory: 'a',
          orgId: 'team_a',
          teamId: 'team_b',
        },
      ],
    });

    await expect(getRepoLink(client, cwd)).rejects.toThrow(
      /conflicting "orgId" and "teamId"/
    );
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
