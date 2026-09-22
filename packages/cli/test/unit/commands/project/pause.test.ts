import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useUser } from '../../../mocks/user';

describe('project pause', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('tracks telemetry for --help', async () => {
    client.setArgv('project', 'pause', '--help');
    const exitCodePromise = project(client);
    await expect(exitCodePromise).resolves.toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'project:pause' },
    ]);
  });

  it('rejects the removed --yes flag', async () => {
    useUser();

    client.setArgv('project', 'pause', 'my-project', '--yes');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('--yes');
  });

  it('errors when the project does not exist', async () => {
    useUser();
    useUnknownProject();

    client.setArgv('project', 'pause', 'unknown-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'There is no project for "unknown-project"'
    );
  });

  it('pauses a named project after typing the project name', async () => {
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
    await expect(client.stderr).toOutput(
      'Type my-project to confirm pausing production traffic:'
    );
    client.stdin.write('my-project\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(pauseCalled).toBe(true);
    await expect(client.stderr).toOutput(
      'Production traffic for my-project paused'
    );
  });

  it('does not pause when the typed name does not match', async () => {
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

    await expect(client.stderr).toOutput(
      'Type my-project to confirm pausing production traffic:'
    );
    client.stdin.write('other-project\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Canceled');
    expect(pauseCalled).toBe(false);
  });

  it('outputs JSON with --json after typed confirmation', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_pause',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/pause', (_req, res) => {
      res.status(200).end();
    });

    client.setArgv('project', 'pause', 'my-project', '--json');
    const exitCodePromise = project(client);

    await expect(client.stderr).toOutput(
      'Type my-project to confirm pausing production traffic:'
    );
    client.stdin.write('my-project\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      id: 'prj_pause',
      name: 'my-project',
      paused: true,
    });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:pause', value: 'pause' },
      { key: 'argument:project', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
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

    client.setArgv('project', 'pause', 'my-project');
    const exitCodePromise = project(client);

    await expect(client.stderr).toOutput(
      'Type my-project to confirm pausing production traffic:'
    );
    client.stdin.write('my-project\n');

    await expect(exitCodePromise).resolves.toEqual(1);
    await expect(client.stderr).toOutput('Not allowed.');
  });

  it('rejects non-interactive mode with a structured payload', async () => {
    useUser();

    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.nonInteractive = true;
    client.setArgv('project', 'pause', 'my-project');

    await expect(project(client)).rejects.toThrow('exit:1');
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.status).toBe('action_required');
    expect(payload.reason).toBe('interactive_confirmation_required');
    expect(payload.userActionRequired).toBe(true);
    expect(payload.message).toContain('stops serving production traffic');
    expect(payload.next?.[0]?.command).toContain('project pause my-project');
    expect(JSON.stringify(payload)).not.toContain('--yes');
  });

  it('rejects a non-TTY stdin with a plain error', async () => {
    useUser();

    let pauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/pause', (_req, res) => {
      pauseCalled = true;
      res.status(200).end();
    });

    client.stdin.isTTY = false;
    client.setArgv('project', 'pause', 'my-project');

    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'This command must be run interactively because it pauses production traffic.'
    );
    expect(pauseCalled).toBe(false);
    expect(client.stdout.getFullOutput().trim()).toBe('');
  });
});
