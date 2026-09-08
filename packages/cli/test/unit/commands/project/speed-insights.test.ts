import { join } from 'path';
import { outputFile } from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';

function useTeamScope(plan = 'pro') {
  client.config.currentTeam = 'team_si';
  client.scenario.get('/v2/user', (_req, res) => {
    res.json({ user: { id: 'user_si', username: 'si-user' } });
  });
  client.scenario.get('/teams/team_si', (_req, res) => {
    res.json({
      id: 'team_si',
      slug: 'si-team',
      name: 'SI Team',
      billing: { plan, period: { start: 0, end: 0 }, addons: [] },
    });
  });
}

describe('project speed-insights', () => {
  beforeEach(() => {
    teamCache.clear();
    client.config.currentTeam = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('enables Speed Insights for a named project after confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    client.scenario.post('/speed-insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: true });
      res.json({ value: true });
    });

    client.setArgv('project', 'speed-insights', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalled();
    await expect(client.stderr).toOutput('Speed Insights is enabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:speed-insights',
        value: 'speed-insights',
      },
    ]);
  });

  it('enables Speed Insights with the explicit `enable` action after confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    client.scenario.post('/speed-insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: true });
      res.json({ value: true });
    });

    client.setArgv('project', 'speed-insights', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalled();
    await expect(client.stderr).toOutput('Speed Insights is enabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:speed-insights',
        value: 'speed-insights enable',
      },
    ]);
  });

  it('tells Hobby users Speed Insights is limited to one project when enabling', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope('hobby');

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.scenario.post('/speed-insights/toggle', (_req, res) => {
      res.json({ value: true });
    });

    client.setArgv('project', 'speed-insights', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(
      'On the Hobby plan, Speed Insights is only available for one project.'
    );
  });

  it('warns paid-plan users about charges when enabling', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope('pro');

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.scenario.post('/speed-insights/toggle', (_req, res) => {
      res.json({ value: true });
    });

    client.setArgv('project', 'speed-insights', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('will incur charges on your account');
  });

  it('cancels enabling without charging when the user declines confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);

    let toggleCalled = false;
    client.scenario.post('/speed-insights/toggle', (_req, res) => {
      toggleCalled = true;
      res.json({ value: true });
    });

    client.setArgv('project', 'speed-insights', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(toggleCalled).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('disables Speed Insights for a named project after confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    client.scenario.post('/speed-insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: false });
      res.json({ value: false });
    });

    client.setArgv('project', 'speed-insights', 'disable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalled();
    await expect(client.stderr).toOutput('Speed Insights is disabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:speed-insights',
        value: 'speed-insights disable',
      },
    ]);
  });

  it('cancels disabling when the user declines confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);

    let toggleCalled = false;
    client.scenario.post('/speed-insights/toggle', (_req, res) => {
      toggleCalled = true;
      res.json({ value: false });
    });

    client.setArgv('project', 'speed-insights', 'disable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(toggleCalled).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('outputs JSON when disabling with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.scenario.post('/speed-insights/toggle', (req, res) => {
      expect(req.body).toEqual({ value: false });
      res.json({ value: false });
    });

    client.setArgv(
      'project',
      'speed-insights',
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

  it('disables Speed Insights for the linked project', async () => {
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
    const prevCwd = client.cwd;
    client.cwd = cwd;

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    let requestQuery: unknown;
    let requestBody: unknown;
    client.scenario.post('/speed-insights/toggle', (req, res) => {
      requestQuery = req.query;
      requestBody = req.body;
      res.json({ value: false });
    });

    client.setArgv('project', 'speed-insights', 'disable');
    try {
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(requestQuery).toMatchObject({ projectId: 'prj_linked' });
      expect(requestBody).toEqual({ value: false });
      await expect(client.stderr).toOutput('Speed Insights is disabled');
    } finally {
      client.cwd = prevCwd;
    }
  });

  it('returns 2 when an action is passed with too many arguments', async () => {
    client.setArgv('project', 'speed-insights', 'enable', 'a', 'b');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Invalid number of arguments. Usage: `vercel project speed-insights enable [name]`'
    );
  });

  it('returns 2 when too many arguments are passed without an action', async () => {
    client.setArgv('project', 'speed-insights', 'a', 'b');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Invalid number of arguments. Usage: `vercel project speed-insights [name]`'
    );
  });

  it('returns 1 when the project is not found', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useUnknownProject();

    client.setArgv('project', 'speed-insights', 'disable', 'does-not-exist');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
  });

  it('outputs JSON when enabling with --format json after confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.scenario.post('/speed-insights/toggle', (_req, res) => {
      res.json({ value: true });
    });

    client.setArgv(
      'project',
      'speed-insights',
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

  describe('enable requires interactive confirmation', () => {
    it('refuses to enable non-interactively and emits an action_required payload', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__');
      }) as never);

      let toggleCalled = false;
      client.scenario.post('/speed-insights/toggle', (_req, res) => {
        toggleCalled = true;
        res.json({ value: true });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'speed-insights',
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
        'project speed-insights enable'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(toggleCalled).toBe(false);
    });

    it('refuses to enable when stdin is not a TTY (no payload, human error)', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      client.stdin.isTTY = false;

      let toggleCalled = false;
      client.scenario.post('/speed-insights/toggle', (_req, res) => {
        toggleCalled = true;
        res.json({ value: true });
      });

      client.setArgv('project', 'speed-insights', 'enable', 'my-project');
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(toggleCalled).toBe(false);
      expect(client.stdout.getFullOutput().trim()).toBe('');
      await expect(client.stderr).toOutput(
        'This command must be run interactively'
      );
    });
  });

  describe('disable requires interactive confirmation', () => {
    it('refuses to disable non-interactively and emits an action_required payload', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__');
      }) as never);

      let toggleCalled = false;
      client.scenario.post('/speed-insights/toggle', (_req, res) => {
        toggleCalled = true;
        res.json({ value: false });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'speed-insights',
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
      expect(payload.message).toContain('stops performance data collection');
      expect(payload.next?.[0]?.command).toContain(
        'project speed-insights disable'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(toggleCalled).toBe(false);
    });

    it('refuses to disable when stdin is not a TTY (no payload, human error)', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      client.stdin.isTTY = false;

      let toggleCalled = false;
      client.scenario.post('/speed-insights/toggle', (_req, res) => {
        toggleCalled = true;
        res.json({ value: false });
      });

      client.setArgv('project', 'speed-insights', 'disable', 'my-project');
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(toggleCalled).toBe(false);
      expect(client.stdout.getFullOutput().trim()).toBe('');
      await expect(client.stderr).toOutput(
        'This command must be run interactively'
      );
    });
  });
});
