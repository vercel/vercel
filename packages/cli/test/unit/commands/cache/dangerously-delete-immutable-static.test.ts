import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
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
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

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
    client.setArgv('cache', 'dangerously-delete-immutable-static');
    const exitCode = await cache(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Missing required argument');
  });

  it('should delete after the typed path confirmation', async () => {
    let deleteCalled = false;
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-immutable-static`,
      (req, res) => {
        deleteCalled = true;
        expect(req.query.projectIdOrName).toEqual(projectId);
        expect(req.body).toEqual({ path: assetPath });
        res.end();
      }
    );
    client.setArgv('cache', 'dangerously-delete-immutable-static', assetPath);
    const exitCodePromise = cache(client);

    await expect(client.stderr).toOutput(
      `Deleting immutable static asset ${assetPath} for project ${projectId} permanently removes it from storage`
    );
    await expect(client.stderr).toOutput(`Type ${assetPath}`);
    client.stdin.write(`${assetPath}\n`);

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(deleteCalled).toBe(true);
    await expect(client.stderr).toOutput(
      `Successfully deleted immutable static asset ${assetPath}; its URL now serves 410`
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:dangerously-delete-immutable-static',
        value: 'dangerously-delete-immutable-static',
      },
      { key: 'argument:path', value: assetPath },
    ]);
  });

  it('does not delete when the typed path does not match', async () => {
    let deleteCalled = false;
    client.scenario.post(
      `/v1/edge-cache/dangerously-delete-immutable-static`,
      (req, res) => {
        deleteCalled = true;
        res.end();
      }
    );
    client.setArgv('cache', 'dangerously-delete-immutable-static', assetPath);
    const exitCodePromise = cache(client);

    await expect(client.stderr).toOutput(`Type ${assetPath}`);
    client.stdin.write('_next/static/immutable/chunks/other.js\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Canceled');
    expect(deleteCalled).toBe(false);
  });

  it('rejects non-interactive mode with a structured payload', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.nonInteractive = true;
    client.setArgv('cache', 'dangerously-delete-immutable-static', assetPath);

    await expect(cache(client)).rejects.toThrow('exit:1');
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.status).toBe('action_required');
  });
});
