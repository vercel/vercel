import { describe, it, beforeEach, expect } from 'vitest';
import cache from '../../../../src/commands/cache';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { basename, join } from 'path';
import { outputFile } from 'fs-extra';

describe('cache purge', () => {
  beforeEach(async () => {
    useUser();
    useTeam('team_dummy');
    const cwd = setupTmpDir();
    client.cwd = cwd;
    useProject({
      ...defaultProject,
      id: basename(cwd),
      name: basename(cwd),
    });
    await outputFile(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ projectId: basename(cwd), orgId: 'team_dummy' })
    );
  });

  it('should error when project is not linked', async () => {
    client.setArgv('cache', 'purge');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
  });

  it('should succeed without --type', async () => {
    client.scenario.post(`/v1/edge-cache/purge-all`, (req, res) => {
      res.end();
    });
    client.scenario.delete(`/v1/data-cache/purge-all`, (req, res) => {
      res.end();
    });
    client.setArgv('cache', 'purge', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
  });

  it('should succeed without --type=all', async () => {
    client.scenario.post(`/v1/edge-cache/purge-all`, (req, res) => {
      res.end();
    });
    client.scenario.delete(`/v1/data-cache/purge-all`, (req, res) => {
      res.end();
    });
    client.setArgv('cache', 'purge', '--type=all', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
  });

  it('should succeed with --type=cdn', async () => {
    client.scenario.post(`/v1/edge-cache/purge-all`, (req, res) => {
      res.end();
    });
    client.setArgv('cache', 'purge', '--type=cdn', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
  });

  it('should succeed with --type=data', async () => {
    client.scenario.delete(`/v1/data-cache/purge-all`, (req, res) => {
      res.end();
    });
    client.setArgv('cache', 'purge', '--type=data', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
  });
});
