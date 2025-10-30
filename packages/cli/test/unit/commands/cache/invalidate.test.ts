import { describe, it, beforeEach, expect } from 'vitest';
import cache from '../../../../src/commands/cache';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { basename, join } from 'path';
import { outputFile } from 'fs-extra';

describe('cache invalidate', () => {
  let projectId = 'wat';
  beforeEach(async () => {
    useUser();
    useTeam('team_dummy');
    const cwd = setupTmpDir();
    client.cwd = cwd;
    projectId = basename(cwd);
    useProject({
      ...defaultProject,
      id: projectId,
      name: projectId,
    });
    await outputFile(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: 'team_dummy' })
    );
  });

  it('should error when project is not linked', async () => {
    client.setArgv('cache', 'invalidate');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
  });

  it('should error without --tag', async () => {
    client.scenario.post(`/v1/edge-cache/invalidate-by-tags`, (req, res) => {
      expect(req.body).toEqual({
        tags: 'foo',
      });
      res.end();
    });
    client.setArgv('cache', 'invalidate', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'The --tag or --srcimg option is required'
    );
  });

  it('should succeed with --tag', async () => {
    client.scenario.post(`/v1/edge-cache/invalidate-by-tags`, (req, res) => {
      expect(req.body).toEqual({
        tags: 'foo',
      });
      res.end();
    });
    client.setArgv('cache', 'invalidate', '--tag=foo', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully invalidated all cached content associated with tag foo'
    );
  });

  it('should succeed with multiple tags', async () => {
    client.scenario.post(`/v1/edge-cache/invalidate-by-tags`, (req, res) => {
      expect(req.body).toEqual({
        tags: 'foo,bar,baz',
      });
      res.end();
    });
    client.setArgv('cache', 'invalidate', '--tag=foo,bar,baz', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully invalidated all cached content associated with tags foo,bar,baz'
    );
  });

  it('should ask for confirmation when --tag is missing --yes', async () => {
    client.setArgv('cache', 'invalidate', '--tag=foo');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to invalidate all cached content associated with tag foo for project ${projectId}. To continue, run \`vercel cache invalidate --tag foo --yes\`.`
    );
  });

  it('should succeed with --srcimg', async () => {
    client.scenario.post(
      `/v1/edge-cache/invalidate-by-src-images`,
      (req, res) => {
        expect(req.body).toEqual({
          srcImages: ['/api/avatar/1'],
        });
        res.end();
      }
    );
    client.setArgv('cache', 'invalidate', '--srcimg=/api/avatar/1', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully invalidated all cached content associated with source image /api/avatar/1'
    );
  });

  it('should ask for confirmation when --srcimg is missing --yes', async () => {
    client.setArgv('cache', 'invalidate', '--srcimg=/api/avatar/1');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to invalidate all cached content associated with source image /api/avatar/1 for project ${projectId}. To continue, run \`vercel cache invalidate --srcimg /api/avatar/1 --yes\`.`
    );
  });

  it('should error when both --tag and --srcimg are provided', async () => {
    client.setArgv(
      'cache',
      'invalidate',
      '--tag=foo',
      '--srcimg=/api/avatar/1'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Cannot use both --tag and --srcimg options'
    );
  });
});
