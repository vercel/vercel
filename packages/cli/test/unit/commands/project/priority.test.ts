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

function usePriorityProject(accountId = 'team_123') {
  useProject({
    ...defaultProject,
    id: 'prj_123',
    name: 'my-project',
    accountId,
  });
}

function useTeamScope(plan = 'pro', status = 'active') {
  client.config.currentTeam = 'team_123';
  client.scenario.get('/v2/user', (_req, res) => {
    res.json({ user: { id: 'user_123', username: 'testuser' } });
  });
  client.scenario.get('/teams/team_123', (_req, res) => {
    res.json({
      id: 'team_123',
      slug: 'my-team',
      name: 'My Team',
      billing: { plan, status, period: { start: 0, end: 0 }, addons: [] },
    });
  });
}

function usePriorityEndpoint() {
  let request: {
    projectId?: string;
    enabled?: boolean;
    teamId?: string;
  } = {};
  client.scenario.post('/v1/security/priority', (req, res) => {
    request = {
      projectId:
        typeof req.query.projectId === 'string'
          ? req.query.projectId
          : undefined,
      enabled: req.body?.enabled,
      teamId:
        typeof req.query.teamId === 'string' ? req.query.teamId : undefined,
    };
    res.json({ enabled: req.body?.enabled, projectId: req.query.projectId });
  });
  return () => request;
}

describe('project priority', () => {
  beforeEach(() => {
    teamCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrades a named project to Priority after confirmation', async () => {
    usePriorityProject();
    useTeamScope();
    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);
    const getRequest = usePriorityEndpoint();

    client.setArgv('project', 'priority', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalledWith(
      'Upgrade my-project on my-team to Priority?',
      false
    );
    expect(getRequest()).toEqual({
      projectId: 'prj_123',
      enabled: true,
      teamId: 'team_123',
    });
    await expect(client.stderr).toOutput('on team my-team (My Team)');
    await expect(client.stderr).toOutput(
      'Priority project is enabled for my-project.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:priority',
        value: 'priority enable',
      },
    ]);
  });

  it('returns a structured error with --json when the API rejects the change', async () => {
    usePriorityProject();
    useTeamScope();
    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.scenario.post('/v1/security/priority', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Not allowed to change Priority for this project.',
        },
      });
    });

    client.setArgv('project', 'priority', 'enable', 'my-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'forbidden',
      message: 'Not allowed to change Priority for this project.',
    });
    expect(client.stderr.getFullOutput()).not.toContain('could not be enabled');
  });

  it('returns a structured plan error with --json before prompting', async () => {
    usePriorityProject();
    useTeamScope('hobby');
    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    client.setArgv('project', 'priority', 'enable', 'my-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'plan_upgrade_required',
    });
    expect(payload.next?.[0]?.command).toContain('buy pro');
    expect(payload.next?.[0]?.command).toContain('--scope my-team');
    expect(client.stderr.getFullOutput()).not.toContain(
      'Priority Projects are only available'
    );
  });

  it('outputs JSON with --format json after confirmation', async () => {
    usePriorityProject();
    useTeamScope();
    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    usePriorityEndpoint();

    client.setArgv(
      'project',
      'priority',
      'enable',
      'my-project',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
      enabled: true,
      projectId: 'prj_123',
      projectName: 'my-project',
    });
  });

  it('cancels without charging when the user declines confirmation', async () => {
    usePriorityProject();
    useTeamScope();
    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);
    const getRequest = usePriorityEndpoint();

    client.setArgv('project', 'priority', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(getRequest()).toEqual({});
    await expect(client.stderr).toOutput('Canceled');
  });

  it('refuses to charge non-interactively and emits an action_required payload', async () => {
    usePriorityProject();
    useTeamScope();

    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);
    const getRequest = usePriorityEndpoint();

    client.setArgv(
      'project',
      'priority',
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
    expect(payload.next?.[0]?.command).toContain('project priority enable');
    expect(payload.next?.[0]?.command).not.toContain('--yes');
    expect(payload.next?.[0]?.when).toContain('interactive terminal');
    expect(payload.hint).toMatch(/cannot be automated/i);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(getRequest()).toEqual({});
  });

  it('refuses --yes rather than treating it as consent', async () => {
    usePriorityProject();
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);
    const getRequest = usePriorityEndpoint();

    client.setArgv(
      'project',
      'priority',
      'enable',
      'my-project',
      '--yes',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('__exit__');
    expect(
      client.stdout.getFullOutput() + client.stderr.getFullOutput()
    ).toMatch(/unknown|unexpected|--yes/i);
    expect(getRequest()).toEqual({});
    expect(exitSpy).toHaveBeenCalled();
  });

  it('returns a structured confirmation error with --json when stdin is not a TTY', async () => {
    usePriorityProject();
    useTeamScope();
    client.stdin.isTTY = false;

    client.setArgv('project', 'priority', 'enable', 'my-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      userActionRequired: true,
    });
    expect(payload.message).toContain('my-project on team my-team');
    expect(client.stderr.getFullOutput()).not.toContain(
      'must be run interactively'
    );
  });

  it('refuses to charge when stdin is not a TTY (no payload, human error)', async () => {
    usePriorityProject();
    useTeamScope();
    client.stdin.isTTY = false;
    const getRequest = usePriorityEndpoint();

    client.setArgv('project', 'priority', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(getRequest()).toEqual({});
    expect(client.stdout.getFullOutput().trim()).toBe('');
    await expect(client.stderr).toOutput(
      'This command must be run interactively'
    );
  });

  it('returns 2 when the action is missing or invalid', async () => {
    client.setArgv('project', 'priority', 'bogus');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Usage: `vercel project priority enable|disable [name]`'
    );
  });

  it('returns 2 for invalid flags', async () => {
    client.setArgv('project', 'priority', 'enable', '--bogus');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
  });

  it('returns 2 for invalid output format', async () => {
    client.setArgv('project', 'priority', 'enable', '--format', 'xml');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
  });

  it('returns 1 when the project is not found', async () => {
    useUnknownProject();
    useTeamScope();
    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

    client.setArgv('project', 'priority', 'enable', 'does-not-exist');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('does-not-exist');
  });

  it('refuses on the Hobby plan without prompting or charging', async () => {
    usePriorityProject();
    useTeamScope('hobby');
    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);
    const getRequest = usePriorityEndpoint();

    client.setArgv('project', 'priority', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(getRequest()).toEqual({});
    const out = client.stderr.getFullOutput();
    expect(out).toContain(
      'Priority Projects are only available on Pro or Enterprise team plans.'
    );
    expect(out).toContain('buy pro');
    expect(out).toContain('project priority enable');
  });

  it('sends a Hobby agent to buy pro, not to confirm enable', async () => {
    usePriorityProject();
    useTeamScope('hobby');
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);
    const getRequest = usePriorityEndpoint();

    client.setArgv(
      'project',
      'priority',
      'enable',
      'my-project',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('__exit__');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'plan_upgrade_required',
      userActionRequired: true,
    });
    expect(payload.message).toContain('Priority Projects');
    expect(payload.next?.[0]?.command).toContain('buy pro');
    expect(payload.next?.[0]?.command).not.toContain('project priority enable');
    expect(payload.next?.[0]?.command).not.toContain('--yes');
    expect(payload.next?.[0]?.when).toMatch(/approved/);
    expect(payload.hint).toContain('buy pro');
    expect(payload.hint).toContain('project priority enable');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(getRequest()).toEqual({});
  });

  it('scopes buy pro to the project team, not the selected one', async () => {
    usePriorityProject();
    useTeamScope('hobby');
    // A linked directory leaves the globally selected team alone; `buy pro`
    // run on its own would upgrade that team instead.
    client.config.currentTeam = 'team_selected';
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);
    const getRequest = usePriorityEndpoint();

    client.setArgv(
      'project',
      'priority',
      'enable',
      'my-project',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('__exit__');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.next?.[0]?.command).toBe('vercel buy pro --scope my-team');
    expect(payload.hint).toContain('buy pro --scope my-team');
    expect(payload.hint).toContain(
      'project priority enable my-project --scope my-team'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(getRequest()).toEqual({});
  });

  it('refuses during a Pro trial without charging', async () => {
    usePriorityProject();
    useTeamScope('pro', 'trialing');
    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);
    const getRequest = usePriorityEndpoint();

    client.setArgv('project', 'priority', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(getRequest()).toEqual({});
    await expect(client.stderr).toOutput(
      'Priority project is not available during the Pro trial period.'
    );
  });

  it('removes Priority from a named project after confirmation', async () => {
    usePriorityProject();
    useTeamScope();
    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);
    const getRequest = usePriorityEndpoint();

    client.setArgv('project', 'priority', 'disable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalledWith(
      'Remove Priority from my-project on my-team?',
      false
    );
    expect(getRequest()).toEqual({
      projectId: 'prj_123',
      enabled: false,
      teamId: 'team_123',
    });
    await expect(client.stderr).toOutput('on team my-team (My Team)');
    await expect(client.stderr).toOutput(
      'Priority project is disabled for my-project.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('retention');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:priority',
        value: 'priority disable',
      },
    ]);
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
    const confirmSpy = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);
    const getRequest = usePriorityEndpoint();

    client.setArgv('project', 'priority', 'disable');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).toHaveBeenCalledWith(
      `Remove Priority from linked-project on ${team.slug}?`,
      false
    );
    expect(getRequest()).toEqual({
      projectId: 'prj_linked',
      enabled: false,
      teamId: team.id,
    });
    await expect(client.stderr).toOutput(
      'Priority project is disabled for linked-project.'
    );
  });
});
