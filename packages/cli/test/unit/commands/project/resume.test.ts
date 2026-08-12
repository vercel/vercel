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

describe('project resume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('project', 'resume', '--help');
      const exitCodePromise = project(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:resume',
        },
      ]);
    });
  });

  it('errors when the project does not exist', async () => {
    useUser();
    useUnknownProject();

    client.setArgv('project', 'resume', 'unknown-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'There is no project for "unknown-project"'
    );
  });

  it('resumes a named project without confirmation', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    let unpauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
      unpauseCalled = true;
      expect(req.params.projectId).toBe('prj_resume');
      res.status(200).end();
    });

    client.setArgv('project', 'resume', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    expect(unpauseCalled).toBe(true);
    await expect(client.stderr).toOutput(
      'Production traffic for my-project resumed'
    );
    // no confirmation prompt for resume
    expect(client.stderr.getFullOutput()).not.toContain('Continue?');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:resume',
        value: 'resume',
      },
      {
        key: 'argument:project',
        value: '[REDACTED]',
      },
    ]);
  });

  it('supports the unpause alias', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
      res.status(200).end();
    });

    client.setArgv('project', 'unpause', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'Production traffic for my-project resumed'
    );

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:resume',
        value: 'unpause',
      },
      {
        key: 'argument:project',
        value: '[REDACTED]',
      },
    ]);
  });

  it('outputs JSON with --json', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
      res.status(200).end();
    });

    client.setArgv('project', 'resume', 'my-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      id: 'prj_resume',
      name: 'my-project',
      paused: false,
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

    let unpauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
      unpauseCalled = true;
      expect(req.params.projectId).toBe('prj_linked');
      res.status(200).end();
    });

    client.setArgv('project', 'resume');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    expect(unpauseCalled).toBe(true);
    await expect(client.stderr).toOutput(
      'Production traffic for linked-project resumed'
    );
  });

  it('maps a 403 from the unpause API to a friendly error', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Not allowed.' },
      });
    });

    client.setArgv('project', 'resume', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Not allowed.');
  });
});
