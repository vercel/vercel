import { join } from 'path';
import { outputFile } from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';

function useTeamScope(plan = 'pro') {
  client.config.currentTeam = 'team_123';
  client.scenario.get('/v2/user', (_req, res) => {
    res.json({ user: { id: 'user_123', username: 'testuser' } });
  });
  client.scenario.get('/teams/team_123', (_req, res) => {
    res.json({
      id: 'team_123',
      slug: 'my-team',
      name: 'My Team',
      billing: { plan, period: { start: 0, end: 0 }, addons: [] },
    });
  });
}

describe('project observability', () => {
  beforeEach(() => {
    teamCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables Observability Plus for a named project after confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope();

    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    let requestBody: unknown;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (req, res) => {
        expect(req.params.projectIdOrName).toBe('prj_123');
        requestBody = req.body;
        res.json({ id: 'prj_123', disabledAt: undefined });
      }
    );

    client.setArgv('project', 'observability', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalled();
    expect(requestBody).toEqual({ disabled: false });
    await expect(client.stderr).toOutput(
      'Observability Plus is enabled for my-project.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:observability',
        value: 'observability enable',
      },
    ]);
  });

  it('outputs JSON with --format json after confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope();

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        res.json({ id: 'prj_123' });
      }
    );

    client.setArgv(
      'project',
      'observability',
      'enable',
      'my-project',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      enabled: true,
      projectId: 'prj_123',
      projectName: 'my-project',
    });
  });

  it('cancels without charging when the user declines confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope();

    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);

    let putCalled = false;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        putCalled = true;
        res.json({ id: 'prj_123' });
      }
    );

    client.setArgv('project', 'observability', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(putCalled).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('refuses to charge non-interactively and emits an action_required payload', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);

    let putCalled = false;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        putCalled = true;
        res.json({ id: 'prj_123' });
      }
    );

    client.setArgv(
      'project',
      'observability',
      'enable',
      'my-project',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('__exit__');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      action: 'confirmation_required',
      userActionRequired: true,
    });
    expect(payload.next?.[0]?.command).toContain(
      'project observability enable'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(putCalled).toBe(false);
  });

  it('refuses to charge when stdin is not a TTY (no payload, human error)', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.stdin.isTTY = false;

    let putCalled = false;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        putCalled = true;
        res.json({ id: 'prj_123' });
      }
    );

    client.setArgv('project', 'observability', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(putCalled).toBe(false);
    expect(client.stdout.getFullOutput().trim()).toBe('');
    await expect(client.stderr).toOutput(
      'This command must be run interactively'
    );
  });

  it('returns 2 when the action is missing or invalid', async () => {
    client.setArgv('project', 'observability', 'bogus');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Usage: `vercel project observability enable|disable [name]`'
    );
  });

  it('returns 1 when the project is not found', async () => {
    useUnknownProject();

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.setArgv('project', 'observability', 'enable', 'does-not-exist');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('does-not-exist');
  });

  it('refuses on the Hobby plan without prompting or charging', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope('hobby');

    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    let putCalled = false;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        putCalled = true;
        res.json({ id: 'prj_123' });
      }
    );

    client.setArgv('project', 'observability', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(putCalled).toBe(false);
    await expect(client.stderr).toOutput(
      'Observability Plus requires an active Pro or Enterprise plan.'
    );
  });

  it('disables Observability Plus for a named project after confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    let method: string | undefined;
    let requestBody: unknown;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (req, res) => {
        method = req.method;
        requestBody = req.body;
        res.json({ id: 'prj_123', disabledAt: Date.now() });
      }
    );

    client.setArgv('project', 'observability', 'disable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalled();
    expect(method).toBe('PUT');
    expect(requestBody).toEqual({ disabled: true });
    await expect(client.stderr).toOutput(
      'Observability Plus is disabled for my-project.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:observability',
        value: 'observability disable',
      },
    ]);
  });

  it('outputs JSON with --format json when disabling', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        res.json({ id: 'prj_123', disabledAt: Date.now() });
      }
    );

    client.setArgv(
      'project',
      'observability',
      'disable',
      'my-project',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      enabled: false,
      projectId: 'prj_123',
      projectName: 'my-project',
    });
  });

  it('cancels disabling when the user declines confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);

    let putCalled = false;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        putCalled = true;
        res.json({ id: 'prj_123' });
      }
    );

    client.setArgv('project', 'observability', 'disable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(putCalled).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('refuses to disable non-interactively and emits an action_required payload', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);

    let putCalled = false;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        putCalled = true;
        res.json({ id: 'prj_123' });
      }
    );

    client.setArgv(
      'project',
      'observability',
      'disable',
      'my-project',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('__exit__');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      action: 'confirmation_required',
      userActionRequired: true,
    });
    expect(payload.next?.[0]?.command).toContain(
      'project observability disable'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(putCalled).toBe(false);
  });

  it('resolves the project from the linked directory when no name is given', async () => {
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

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    let requestBody: unknown;
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (req, res) => {
        expect(req.params.projectIdOrName).toBe('prj_linked');
        requestBody = req.body;
        res.json({ id: 'prj_linked', disabledAt: Date.now() });
      }
    );

    client.setArgv('project', 'observability', 'disable');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(requestBody).toEqual({ disabled: true });
    await expect(client.stderr).toOutput(
      'Observability Plus is disabled for linked-project.'
    );
  });
});
