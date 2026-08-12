import { join } from 'path';
import { outputFile } from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('project pause', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('project', 'pause', '--help');
      const exitCodePromise = project(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:pause',
        },
      ]);
    });
  });

  it('errors when the project does not exist', async () => {
    useUser();
    useUnknownProject();

    client.setArgv('project', 'pause', 'unknown-project', '--yes');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'There is no project for "unknown-project"'
    );
  });

  it('pauses a named project after confirmation', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_pause',
      name: 'my-project',
    });

    let pauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/pause', (req, res) => {
      pauseCalled = true;
      expect(req.params.projectId).toBe('prj_pause');
      res.status(200).end();
    });

    client.setArgv('project', 'pause', 'my-project');
    const exitCodePromise = project(client);

    await expect(client.stderr).toOutput(
      'Pausing my-project will stop serving production traffic'
    );
    client.stdin.write('y\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(pauseCalled).toBe(true);
    await expect(client.stderr).toOutput(
      'Production traffic for my-project paused'
    );

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:pause',
        value: 'pause',
      },
      {
        key: 'argument:project',
        value: '[REDACTED]',
      },
    ]);
  });

  it('does not pause when the user declines', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_pause',
      name: 'my-project',
    });

    let pauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/pause', (_req, res) => {
      pauseCalled = true;
      res.status(200).end();
    });

    client.setArgv('project', 'pause', 'my-project');
    const exitCodePromise = project(client);

    await expect(client.stderr).toOutput('Continue?');
    client.stdin.write('n\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Canceled');
    expect(pauseCalled).toBe(false);
  });

  it('skips confirmation with --yes', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_pause',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/pause', (_req, res) => {
      res.status(200).end();
    });

    client.setArgv('project', 'pause', 'my-project', '--yes');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Production traffic for my-project paused'
    );

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:pause',
        value: 'pause',
      },
      {
        key: 'argument:project',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('outputs JSON with --json', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_pause',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/pause', (_req, res) => {
      res.status(200).end();
    });

    client.setArgv('project', 'pause', 'my-project', '--yes', '--json');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      id: 'prj_pause',
      name: 'my-project',
      paused: true,
    });
  });

  it('falls back to the linked project when no argument is given', async () => {
    const team = useTeam('team_linked');
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_linked',
      name: 'linked-project',
      accountId: team.id,
    });

    const cwd = setupTmpDir();
    await outputFile(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ orgId: team.id, projectId: 'prj_linked' })
    );
    client.cwd = cwd;

    let pauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/pause', (req, res) => {
      pauseCalled = true;
      expect(req.params.projectId).toBe('prj_linked');
      res.status(200).end();
    });

    client.setArgv('project', 'pause', '--yes');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    expect(pauseCalled).toBe(true);
    await expect(client.stderr).toOutput(
      'Production traffic for linked-project paused'
    );
  });

  it('maps a 403 from the pause API to a friendly error', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_pause',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/pause', (_req, res) => {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Not allowed.' },
      });
    });

    client.setArgv('project', 'pause', 'my-project', '--yes');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Not allowed.');
  });

  it('requires --yes in non-interactive mode', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_pause',
      name: 'my-project',
    });

    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.nonInteractive = true;
    client.setArgv('project', 'pause', 'my-project');

    await expect(project(client)).rejects.toThrow('exit:1');
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.status).toBe('action_required');
    expect(payload.reason).toBe('confirmation_required');
    expect(payload.next?.[0]?.command).toContain('--yes');
  });
});
