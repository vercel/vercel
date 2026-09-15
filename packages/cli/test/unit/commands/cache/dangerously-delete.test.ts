import { describe, it, beforeEach, expect } from 'vitest';
import cache from '../../../../src/commands/cache';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import {
  removeProjectLink,
  setupTmpDir,
} from '../../../helpers/setup-unit-fixture';
import { basename, join } from 'path';
import { outputFile } from 'fs-extra';

describe('cache dangerously-delete', () => {
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
      accountId: 'team_dummy',
    });
    await outputFile(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: 'team_dummy' })
    );
  });

  it('should error without --tag', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-by-tags`,
      (req, res) => {
        expect(req.body).toEqual({
          tags: 'foo',
        });
        res.end();
      }
    );
    client.setArgv('cache', 'dangerously-delete', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'The --tag, --srcimg, or --immutable-static-path option is required'
    );
  });

  it('should succeed with --tag', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-by-tags`,
      (req, res) => {
        expect(req.body).toEqual({
          tags: 'foo',
        });
        res.end();
      }
    );
    client.setArgv('cache', 'dangerously-delete', '--tag=foo', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully deleted all cached content associated with tag foo'
    );
  });

  it('should succeed with --project when cwd is not linked', async () => {
    removeProjectLink(client.cwd);
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-by-tags`,
      (req, res) => {
        expect(req.query.projectIdOrName).toEqual(projectId);
        expect(req.body).toEqual({
          tags: 'foo',
        });
        res.end();
      }
    );

    client.setArgv(
      'cache',
      'dangerously-delete',
      '--project',
      projectId,
      '--tag=foo',
      '--yes'
    );
    const exitCode = await cache(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:dangerously-delete', value: 'dangerously-delete' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
      { key: 'option:tag', value: 'foo' },
    ]);
  });

  it('should succeed with multiple tags', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-by-tags`,
      (req, res) => {
        expect(req.body).toEqual({
          tags: 'foo,bar,baz',
        });
        res.end();
      }
    );
    client.setArgv('cache', 'dangerously-delete', '--tag=foo,bar,baz', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully deleted all cached content associated with tags foo,bar,baz'
    );
  });

  it('should succeed with --tag and --revalidation-deadline-seconds', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-by-tags`,
      (req, res) => {
        expect(req.body).toEqual({
          tags: 'foo',
          revalidationDeadlineSeconds: 60,
        });
        res.end();
      }
    );
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--tag=foo',
      '--revalidation-deadline-seconds=60',
      '--yes'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully deleted all cached content associated with tag foo'
    );
  });

  it('should ask for confirmation when --tag is missing --yes', async () => {
    client.setArgv('cache', 'dangerously-delete', '--tag=foo');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to dangerously delete all cached content associated with tag foo for project ${projectId}. To continue, run \`vercel cache dangerously-delete --tag foo --yes\`.`
    );
  });

  it('should ask for confirmation when --tag and --revalidation-deadline-seconds is missing --yes', async () => {
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--tag=foo',
      '--revalidation-deadline-seconds=60'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to dangerously delete all cached content associated with tag foo for project ${projectId}. To continue, run \`vercel cache dangerously-delete --tag foo --revalidation-deadline-seconds 60 --yes\`.`
    );
  });

  it('should succeed with --srcimg', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-by-src-images`,
      (req, res) => {
        expect(req.body).toEqual({
          srcImages: ['/api/avatar/1'],
        });
        res.end();
      }
    );
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--srcimg=/api/avatar/1',
      '--yes'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully deleted all cached content associated with source image /api/avatar/1'
    );
  });

  it('should succeed with --srcimg and --revalidation-deadline-seconds', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-by-src-images`,
      (req, res) => {
        expect(req.body).toEqual({
          srcImages: ['/api/avatar/1'],
          revalidationDeadlineSeconds: 60,
        });
        res.end();
      }
    );
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--srcimg=/api/avatar/1',
      '--revalidation-deadline-seconds=60',
      '--yes'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully deleted all cached content associated with source image /api/avatar/1'
    );
  });

  it('should ask for confirmation when --srcimg is missing --yes', async () => {
    client.setArgv('cache', 'dangerously-delete', '--srcimg=/api/avatar/1');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to dangerously delete all cached content associated with source image /api/avatar/1 for project ${projectId}. To continue, run \`vercel cache dangerously-delete --srcimg /api/avatar/1 --yes\`.`
    );
  });

  it('should ask for confirmation when --srcimg and --revalidation-deadline-seconds is missing --yes', async () => {
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--srcimg=/api/avatar/1',
      '--revalidation-deadline-seconds=60'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to dangerously delete all cached content associated with source image /api/avatar/1 for project ${projectId}. To continue, run \`vercel cache dangerously-delete --srcimg /api/avatar/1 --revalidation-deadline-seconds 60 --yes\`.`
    );
  });

  it('should error when both --tag and --srcimg are provided', async () => {
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--tag=foo',
      '--srcimg=/api/avatar/1'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Can only use one of the --tag, --srcimg, and --immutable-static-path options'
    );
  });

  it('should succeed with --immutable-static-path', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-immutable-static`,
      (req, res) => {
        expect(req.body).toEqual({
          path: '_next/static/immutable/chunks/example.js',
        });
        res.end();
      }
    );
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--immutable-static-path=_next/static/immutable/chunks/example.js',
      '--yes'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Successfully deleted immutable static asset _next/static/immutable/chunks/example.js; its URL now serves 410'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:dangerously-delete', value: 'dangerously-delete' },
      { key: 'flag:yes', value: 'TRUE' },
      {
        key: 'option:immutable-static-path',
        value: '_next/static/immutable/chunks/example.js',
      },
    ]);
  });

  it('should print the permanent-delete warning for --immutable-static-path without --yes', async () => {
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--immutable-static-path=_next/static/immutable/chunks/example.js'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to permanently delete immutable static asset _next/static/immutable/chunks/example.js from storage for project ${projectId}. This cannot be undone and its URL will serve 410 for 7 days. To continue, run \`vercel cache dangerously-delete --immutable-static-path _next/static/immutable/chunks/example.js --yes\`.`
    );
  });

  it('should error when --immutable-static-path is combined with --revalidation-deadline-seconds', async () => {
    client.setArgv(
      'cache',
      'dangerously-delete',
      '--immutable-static-path=_next/static/immutable/chunks/example.js',
      '--revalidation-deadline-seconds=60'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Cannot use --revalidation-deadline-seconds with --immutable-static-path'
    );
  });
});
