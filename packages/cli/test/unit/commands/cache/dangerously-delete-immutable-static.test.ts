import { describe, it, beforeEach, expect } from 'vitest';
import cache from '../../../../src/commands/cache';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { basename, join } from 'path';
import { outputFile } from 'fs-extra';

describe('cache dangerously-delete-immutable-static', () => {
  const assetPath = '_next/static/immutable/chunks/example.js';
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

  it('should error without a path argument', async () => {
    client.setArgv('cache', 'dangerously-delete-immutable-static', '--yes');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Missing required argument');
  });

  it('should succeed with a path and --yes', async () => {
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-immutable-static`,
      (req, res) => {
        expect(req.query.projectIdOrName).toEqual(projectId);
        expect(req.body).toEqual({ path: assetPath });
        res.end();
      }
    );
    client.setArgv(
      'cache',
      'dangerously-delete-immutable-static',
      assetPath,
      '--yes'
    );
    const exitCode = await cache(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      `Successfully deleted immutable static asset ${assetPath}; its URL now serves 410`
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:dangerously-delete-immutable-static',
        value: 'dangerously-delete-immutable-static',
      },
      { key: 'argument:path', value: assetPath },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('should print the permanent-delete warning without --yes', async () => {
    client.setArgv('cache', 'dangerously-delete-immutable-static', assetPath);
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `You are about to permanently delete immutable static asset ${assetPath} from storage for project ${projectId}. This cannot be undone and its URL will serve 410 for 7 days. To continue, run \`vercel cache dangerously-delete-immutable-static ${assetPath} --yes\`.`
    );
  });
});
