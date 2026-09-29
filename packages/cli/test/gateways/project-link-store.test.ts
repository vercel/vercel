import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveProjectLinkStore } from '../../src/gateways/project-link-store';
import { FakeProjectLinkStore } from '../fakes/fake-project-link-store';

const repoConfig = {
  remoteName: 'origin',
  projects: [
    { id: 'prj_1', name: 'web', directory: 'apps/web', orgId: 'team_1' },
  ],
};

describe('FakeProjectLinkStore', () => {
  const root = resolve('/repo');
  const app = join(root, 'apps', 'web');

  it('finds a project link in the directory', async () => {
    const store = new FakeProjectLinkStore({
      projectLinks: { [app]: { orgId: 'team_1', projectId: 'prj_1' } },
    });

    await expect(store.readProjectLink({ dir: app })).resolves.toEqual({
      type: 'found',
      value: { orgId: 'team_1', projectId: 'prj_1' },
    });
    await expect(store.readProjectLink({ dir: root })).resolves.toEqual({
      type: 'missing',
    });
  });

  it('reports conflicting config directories as an error', async () => {
    const store = new FakeProjectLinkStore({
      projectLinks: { [app]: { kind: 'conflicting-directories' } },
    });

    await expect(store.readProjectLink({ dir: app })).resolves.toMatchObject({
      type: 'error',
      error: { code: 'CONFLICTING_CONFIG_DIRECTORIES' },
    });
  });

  it('finds the nearest repo.json above the working directory', async () => {
    const store = new FakeProjectLinkStore({ repos: { [root]: repoConfig } });

    await expect(store.findRepoLink({ cwd: app })).resolves.toEqual({
      type: 'found',
      value: {
        rootPath: root,
        repoConfigPath: join(root, '.vercel', 'repo.json'),
        repoConfig,
      },
    });
  });

  it('prefers a repo.json root over a nearer Git root', async () => {
    const store = new FakeProjectLinkStore({
      repos: { [root]: repoConfig, [join(root, 'apps')]: 'git-only' },
    });

    const result = await store.findRepoLink({ cwd: app });

    expect(result).toMatchObject({ type: 'found', value: { rootPath: root } });
  });

  it('falls back to a Git root without repo.json', async () => {
    const store = new FakeProjectLinkStore({ repos: { [root]: 'git-only' } });

    await expect(store.findRepoLink({ cwd: app })).resolves.toMatchObject({
      type: 'found',
      value: { rootPath: root, repoConfig: undefined },
    });
    await expect(
      store.findRepoLink({ cwd: resolve('/elsewhere') })
    ).resolves.toEqual({ type: 'missing' });
  });
});

describe('liveProjectLinkStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vercel-cli-project-link-store-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads project.json', async () => {
    mkdirSync(join(dir, '.vercel'));
    writeFileSync(
      join(dir, '.vercel', 'project.json'),
      JSON.stringify({ orgId: 'team_1', projectId: 'prj_1' })
    );

    await expect(
      liveProjectLinkStore().readProjectLink({ dir })
    ).resolves.toEqual({
      type: 'found',
      value: { orgId: 'team_1', projectId: 'prj_1' },
    });
  });

  it('reports a missing project.json', async () => {
    await expect(
      liveProjectLinkStore().readProjectLink({ dir })
    ).resolves.toEqual({ type: 'missing' });
  });

  it('reports conflicting .vercel and .now directories as an error', async () => {
    mkdirSync(join(dir, '.vercel'));
    mkdirSync(join(dir, '.now'));

    await expect(
      liveProjectLinkStore().readProjectLink({ dir })
    ).resolves.toMatchObject({
      type: 'error',
      error: { code: 'CONFLICTING_CONFIG_DIRECTORIES' },
    });
  });

  it('reports an unreadable project.json as an error', async () => {
    mkdirSync(join(dir, '.vercel'));
    writeFileSync(join(dir, '.vercel', 'project.json'), '{ not json');

    await expect(
      liveProjectLinkStore().readProjectLink({ dir })
    ).resolves.toMatchObject({ type: 'error' });
  });

  it('finds repo.json by walking up from a nested directory', async () => {
    mkdirSync(join(dir, '.vercel'));
    writeFileSync(
      join(dir, '.vercel', 'repo.json'),
      JSON.stringify(repoConfig)
    );
    const cwd = join(dir, 'apps', 'web');
    mkdirSync(cwd, { recursive: true });

    await expect(liveProjectLinkStore().findRepoLink({ cwd })).resolves.toEqual(
      {
        type: 'found',
        value: {
          rootPath: dir,
          repoConfigPath: join(dir, '.vercel', 'repo.json'),
          repoConfig,
        },
      }
    );
  });
});
