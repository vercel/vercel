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
    client.nonInteractive = false;
  });

  function trackPut() {
    const bodies: unknown[] = [];
    const teamIds: unknown[] = [];
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (req, res) => {
        bodies.push(req.body);
        teamIds.push(req.query.teamId);
        res.json({ id: req.params.projectIdOrName });
      }
    );
    return { bodies, teamIds };
  }

  function mockExit() {
    return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
  }

  it('enables Observability Plus for a named project without a prompt', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      accountId: 'team_123',
    });
    useTeamScope();

    const confirmSpy = vi.spyOn(client.input, 'confirm');
    const { bodies, teamIds } = trackPut();

    client.setArgv('project', 'observability', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(bodies).toEqual([{ disabled: false }]);
    expect(teamIds).toEqual(['team_123']);
    await expect(client.stderr).toOutput(
      'Observability Plus is enabled for my-project on team my-team.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('incur charges');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:observability',
        value: 'observability enable',
      },
    ]);
  });

  it('outputs JSON when enabling with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope();
    trackPut();

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

  it('enables non-interactively without --yes or --scope', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      accountId: 'team_123',
    });
    useTeamScope();
    const { bodies } = trackPut();

    client.nonInteractive = true;
    client.setArgv(
      'project',
      'observability',
      'enable',
      'my-project',
      '--non-interactive'
    );

    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([{ disabled: false }]);
    await expect(client.stderr).toOutput(
      'Observability Plus is enabled for my-project on team my-team.'
    );
  });

  it('enables when stdin is not a TTY', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope();
    client.stdin.isTTY = false;
    const { bodies } = trackPut();

    client.setArgv('project', 'observability', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([{ disabled: false }]);
    expect(client.stderr.getFullOutput()).not.toContain(
      'must be run interactively'
    );
  });

  it('refuses to enable when VERCEL_ORG_ID names a different team', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      accountId: 'team_123',
    });
    useTeamScope();
    vi.stubEnv('VERCEL_ORG_ID', 'team_someone_else');
    mockExit();
    const { bodies } = trackPut();

    client.nonInteractive = true;
    client.setArgv(
      'project',
      'observability',
      'enable',
      'my-project',
      '--non-interactive'
    );

    try {
      await expect(project(client)).rejects.toThrow('exit:1');
    } finally {
      vi.unstubAllEnvs();
    }

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({ status: 'error', reason: 'conflict' });
    expect(payload.message).toContain(
      "Can't enable Observability Plus for my-project."
    );
    expect(bodies).toEqual([]);
  });

  it('leaves plan availability to the API', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    useTeamScope('hobby');

    const confirmSpy = vi.spyOn(client.input, 'confirm');
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        res.status(402).json({
          error: {
            code: 'payment_required',
            message: 'Observability Plus requires a Pro or Enterprise plan.',
          },
        });
      }
    );

    client.setArgv('project', 'observability', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    await expect(client.stderr).toOutput(
      'Observability Plus requires a Pro or Enterprise plan.'
    );
  });

  it('reports a plan refusal to agents as plan_limit', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      accountId: 'team_123',
    });
    useTeamScope('hobby');
    mockExit();
    client.scenario.put(
      '/v1/observability/manage/configuration/projects/:projectIdOrName',
      (_req, res) => {
        res.status(402).json({
          error: {
            code: 'payment_required',
            message: 'Observability Plus requires a Pro or Enterprise plan.',
          },
        });
      }
    );

    client.nonInteractive = true;
    client.setArgv(
      'project',
      'observability',
      'enable',
      'my-project',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('exit:1');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'plan_limit',
      message:
        "Couldn't enable Observability Plus for my-project on team my-team. It may not be available on the current plan.",
      userActionRequired: true,
      data: {
        apiMessage: 'Observability Plus requires a Pro or Enterprise plan.',
      },
    });
    expect(payload.hint).toContain('Pro or Enterprise team');
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

  it('requires --yes to disable non-interactively and suggests the exact command', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    mockExit();
    const { bodies } = trackPut();

    client.nonInteractive = true;
    client.setArgv(
      'project',
      'observability',
      'disable',
      'my-project',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('exit:1');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      userActionRequired: true,
      missing: ['--yes'],
    });
    expect(payload.message).toContain('turn off enhanced observability');
    expect(payload.next[0].command).toMatch(
      /^vercel project observability disable my-project --yes\b/
    );
    expect(bodies).toEqual([]);
  });

  it('disables with --yes non-interactively and prints JSON', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    const confirmSpy = vi.spyOn(client.input, 'confirm');
    const { bodies } = trackPut();

    client.nonInteractive = true;
    client.setArgv(
      'project',
      'observability',
      'disable',
      'my-project',
      '--yes',
      '--json'
    );

    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(bodies).toEqual([{ disabled: true }]);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      enabled: false,
      projectId: 'prj_123',
      projectName: 'my-project',
    });
  });

  it('requires --scope with --yes to disable on a team project', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      accountId: 'team_123',
    });
    useTeamScope();
    mockExit();
    const { bodies } = trackPut();

    client.nonInteractive = true;
    client.setArgv(
      'project',
      'observability',
      'disable',
      'my-project',
      '--yes',
      '--non-interactive'
    );

    await expect(project(client)).rejects.toThrow('exit:1');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      reason: 'missing_scope',
      missing: ['--scope'],
    });
    expect(payload.next[0].command).toMatch(
      /^vercel project observability disable my-project --yes --scope my-team\b/
    );
    expect(bodies).toEqual([]);
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
      'Observability Plus is disabled for linked-project on team '
    );
  });
});
