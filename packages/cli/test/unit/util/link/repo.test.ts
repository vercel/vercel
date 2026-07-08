import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import { mkdirp, readJSON, writeJSON } from 'fs-extra';
import execa from 'execa';
import type { Project } from '@vercel-internals/types';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import type { RepoProjectConfig } from '../../../../src/util/link/repo';
import {
  findProjectsFromPath,
  findRepoRoot,
  linkRepoProject,
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

describe('linkRepoProject()', () => {
  function fakeProject(id: string, rootDirectory: string | null): Project {
    return { id, name: id, rootDirectory } as Project;
  }

  async function setupRepo(existingProjects?: RepoProjectConfig[]) {
    const cwd = setupTmpDir();
    await execa('git', ['init'], { cwd });
    if (existingProjects) {
      await mkdirp(join(cwd, '.vercel'));
      await writeJSON(join(cwd, '.vercel', 'repo.json'), {
        remoteName: 'origin',
        projects: existingProjects,
      });
    }
    return cwd;
  }

  async function readProjects(cwd: string): Promise<RepoProjectConfig[]> {
    const config = await readJSON(join(cwd, '.vercel', 'repo.json'));
    return config.projects;
  }

  it('keeps a same-team entry at the same directory (selection happens at use time)', async () => {
    const cwd = await setupRepo([
      { id: 'old', name: 'old', directory: 'apps/site', orgId: 'team_a' },
    ]);

    await linkRepoProject(client, cwd, {
      project: fakeProject('new', 'apps/site'),
      orgId: 'team_a',
      orgSlug: 'team-a',
      remoteName: 'origin',
    });

    const projects = await readProjects(cwd);
    expect(projects.map(p => p.id).sort()).toEqual(['new', 'old']);
  });

  it('keeps another team\u2019s entry at the same directory', async () => {
    const cwd = await setupRepo([
      { id: 'theirs', name: 'theirs', directory: 'apps/site', orgId: 'team_b' },
    ]);

    await linkRepoProject(client, cwd, {
      project: fakeProject('mine', 'apps/site'),
      orgId: 'team_a',
      orgSlug: 'team-a',
      remoteName: 'origin',
    });

    const projects = await readProjects(cwd);
    expect(projects.map(p => p.id).sort()).toEqual(['mine', 'theirs']);
  });

  it('materializes a legacy top-level orgId onto kept entries', async () => {
    const cwd = await setupRepo();
    await mkdirp(join(cwd, '.vercel'));
    await writeJSON(join(cwd, '.vercel', 'repo.json'), {
      remoteName: 'origin',
      orgId: 'team_a',
      projects: [{ id: 'legacy', name: 'legacy', directory: 'apps/site' }],
    });

    await linkRepoProject(client, cwd, {
      project: fakeProject('new', 'apps/other'),
      orgId: 'team_b',
      orgSlug: 'team-b',
      remoteName: 'origin',
    });

    const projects = await readProjects(cwd);
    expect(projects).toHaveLength(2);
    // The kept legacy entry inherits the old top-level orgId, which is no
    // longer written at the top level.
    expect(projects.find(p => p.id === 'legacy')).toMatchObject({
      orgId: 'team_a',
    });
    const config = await readJSON(join(cwd, '.vercel', 'repo.json'));
    expect(config.orgId).toBeUndefined();
  });

  it('always replaces an entry with the same project id', async () => {
    const cwd = await setupRepo([
      { id: 'proj', name: 'proj', directory: 'apps/old', orgId: 'team_a' },
    ]);

    await linkRepoProject(client, cwd, {
      project: fakeProject('proj', 'apps/new'),
      orgId: 'team_a',
      orgSlug: 'team-a',
      remoteName: 'origin',
    });

    const projects = await readProjects(cwd);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ id: 'proj', directory: 'apps/new' });
  });

  it('records the org slug for display', async () => {
    const cwd = await setupRepo();

    await linkRepoProject(client, cwd, {
      project: fakeProject('proj', 'apps/site'),
      orgId: 'team_a',
      orgSlug: 'team-a',
      remoteName: 'origin',
    });

    const projects = await readProjects(cwd);
    expect(projects[0]).toMatchObject({ orgId: 'team_a', orgSlug: 'team-a' });
  });
});
