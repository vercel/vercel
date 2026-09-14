import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useUser } from '../../../mocks/user';

describe('project resume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
    client.stdin.isTTY = true;
  });

  it('tracks telemetry for --help', async () => {
    client.setArgv('project', 'resume', '--help');
    const exitCodePromise = project(client);
    await expect(exitCodePromise).resolves.toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'project:resume' },
    ]);
  });

  it('errors when the project does not exist', async () => {
    useUser();
    useUnknownProject();

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.setArgv('project', 'resume', 'unknown-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'There is no project for "unknown-project"'
    );
  });

  it('emits a JSON error on stdout when the project is not found with --json', async () => {
    useUser();
    useUnknownProject();

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.setArgv('project', 'resume', 'unknown-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);

    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toEqual({
      status: 'error',
      reason: 'project_not_found',
      message: 'There is no project for "unknown-project"',
    });
  });

  it('resumes a named project after confirmation', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    let unpauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
      unpauseCalled = true;
      expect(req.params.projectId).toBe('prj_resume');
      res.status(200).end();
    });

    client.setArgv('project', 'resume', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    expect(confirmSpy).toHaveBeenCalled();
    expect(unpauseCalled).toBe(true);
    await expect(client.stderr).toOutput(
      'Production traffic for my-project resumed'
    );

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:resume', value: 'resume' },
      { key: 'argument:project', value: '[REDACTED]' },
    ]);
  });

  it('supports the unpause alias and outputs JSON with --json', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
      res.status(200).end();
    });

    client.setArgv('project', 'unpause', 'my-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      id: 'prj_resume',
      name: 'my-project',
      paused: false,
    });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:resume', value: 'unpause' },
      { key: 'argument:project', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('does not resume when the user declines confirmation', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);

    let unpauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
      unpauseCalled = true;
      res.status(200).end();
    });

    client.setArgv('project', 'resume', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    expect(unpauseCalled).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('maps a 403 from the unpause API to a friendly error', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

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

  describe('confirmation is required (non-interactive / agentic)', () => {
    it('emits a structured error for too many arguments', async () => {
      useUser();
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      client.nonInteractive = true;
      client.setArgv('project', 'resume', 'one', 'two', '--non-interactive');

      await project(client);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.message).toContain('Invalid number of arguments');
      expect(exitSpy).toHaveBeenCalledWith(2);

      exitSpy.mockRestore();
    });

    it('refuses to resume and emits an action_required payload', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'prj_resume',
        name: 'my-project',
      });

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      let unpauseCalled = false;
      client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
        unpauseCalled = true;
        res.status(200).end();
      });

      client.nonInteractive = true;
      client.setArgv('project', 'resume', 'my-project', '--non-interactive');

      await project(client);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
      });
      expect(payload.next?.[0]?.command).toContain('project resume');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(unpauseCalled).toBe(false);

      exitSpy.mockRestore();
    });
  });

  describe('confirmation is required (non-TTY / piped)', () => {
    it('refuses to resume with a human error and no payload', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'prj_resume',
        name: 'my-project',
      });

      let unpauseCalled = false;
      client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
        unpauseCalled = true;
        res.status(200).end();
      });

      client.stdin.isTTY = false;
      client.setArgv('project', 'resume', 'my-project');
      const exitCode = await project(client);
      expect(exitCode).toEqual(1);
      expect(unpauseCalled).toBe(false);
      expect(client.stdout.getFullOutput().trim()).toBe('');
      await expect(client.stderr).toOutput(
        'This command must be run interactively'
      );
    });
  });
});
