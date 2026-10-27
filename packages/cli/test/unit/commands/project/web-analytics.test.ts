import { basename, join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outputFile } from 'fs-extra';
import type { User } from '@vercel-internals/types';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';

function billing(plan: string): User['billing'] {
  return { plan } as User['billing'];
}

describe('project web-analytics', () => {
  it('enables Web Analytics for a named project without a prompt', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });
    const confirmSpy = vi.spyOn(client.input, 'confirm');

    client.scenario.post('/web/insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: true });
      res.json({ value: true });
    });

    client.setArgv('project', 'web-analytics', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    await expect(client.stderr).toOutput('Web Analytics is enabled');
    expect(client.stderr.getFullOutput()).not.toContain('incur charges');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:web-analytics',
        value: 'web-analytics',
      },
    ]);
  });

  it('outputs JSON with --format json', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/web/insights/toggle', (_req, res) => {
      res.json({ value: true });
    });

    client.setArgv(
      'project',
      'web-analytics',
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

  it('disables Web Analytics for a named project', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/web/insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: false });
      res.json({ value: false });
    });

    client.setArgv('project', 'web-analytics', 'disable', 'my-project');
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will stop data collection');
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is disabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:web-analytics',
        value: 'web-analytics disable',
      },
    ]);
  });

  it('does not disable when the user declines the confirmation', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    let apiCalled = false;
    client.scenario.post('/web/insights/toggle', (_req, res) => {
      apiCalled = true;
      res.json({ value: false });
    });

    client.setArgv('project', 'web-analytics', 'disable', 'my-project');
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will stop data collection');
    client.stdin.write('n\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Canceled');
    expect(apiCalled).toBe(false);
  });

  it('enables Web Analytics with an explicit enable action', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/web/insights/toggle', (req, res) => {
      expect(req.body).toEqual({ value: true });
      res.json({ value: true });
    });

    client.setArgv('project', 'web-analytics', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is enabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:web-analytics',
        value: 'web-analytics enable',
      },
    ]);
  });

  it('outputs JSON with enabled=false when disabling', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/web/insights/toggle', (_req, res) => {
      res.json({ value: false });
    });

    client.setArgv(
      'project',
      'web-analytics',
      'disable',
      'my-project',
      '--format',
      'json'
    );
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will stop data collection');
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      enabled: false,
      projectId: 'prj_123',
      projectName: 'my-project',
    });
  });

  it('disables Web Analytics for the linked project when no name is given', async () => {
    useUser();
    useTeam('team_dummy');
    const cwd = setupTmpDir();
    const prevCwd = client.cwd;
    client.cwd = cwd;
    const projectId = basename(cwd);
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

    let receivedProjectId: string | undefined;
    client.scenario.post('/web/insights/toggle', (req, res) => {
      receivedProjectId = req.query.projectId as string;
      expect(req.body).toEqual({ value: false });
      res.json({ value: false });
    });

    try {
      client.setArgv('project', 'web-analytics', 'disable');
      const exitCodePromise = project(client);
      await expect(client.stderr).toOutput('will stop data collection');
      client.stdin.write('y\n');
      const exitCode = await exitCodePromise;
      expect(exitCode).toBe(0);
      expect(receivedProjectId).toBe(projectId);
      await expect(client.stderr).toOutput('Web Analytics is disabled');
    } finally {
      client.cwd = prevCwd;
    }
  });

  it('returns 1 when the named project is not found', async () => {
    client.setArgv('project', 'web-analytics', 'disable', 'missing-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
  });

  it('targets a project literally named "disable" by its project ID', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_shadowed_123',
      name: 'disable',
    });

    client.scenario.post('/web/insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_shadowed_123');
      expect(req.body).toEqual({ value: false });
      res.json({ value: false });
    });

    client.setArgv('project', 'web-analytics', 'disable', 'prj_shadowed_123');
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will stop data collection');
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is disabled');
  });

  it('returns 2 when the action form is given too many arguments', async () => {
    client.setArgv('project', 'web-analytics', 'enable', 'a', 'b');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Invalid number of arguments. Usage: `vercel project web-analytics enable [name]`'
    );
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('enables a paid feature without --yes', async () => {
      useUser({ billing: billing('pro') });
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });

      const bodies: unknown[] = [];
      client.scenario.post('/web/insights/toggle', (req, res) => {
        bodies.push(req.body);
        res.json({ value: true });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'enable',
        'my-project',
        '--non-interactive'
      );

      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(bodies).toEqual([{ value: true }]);
      await expect(client.stderr).toOutput('Web Analytics is enabled');
    });

    it('enables for Hobby projects and leaves plan limits to the API', async () => {
      useUser({ billing: billing('hobby') });
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });

      const bodies: unknown[] = [];
      client.scenario.post('/web/insights/toggle', (req, res) => {
        bodies.push(req.body);
        res.json({ value: true });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'enable',
        'my-project',
        '--non-interactive'
      );

      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(bodies).toEqual([{ value: true }]);
    });

    it('refuses to disable non-interactively with an action_required payload', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      let apiCalled = false;
      client.scenario.post('/web/insights/toggle', (_req, res) => {
        apiCalled = true;
        res.json({ value: false });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'disable',
        'my-project',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
      });
      expect(payload.message).toContain('stop data collection');
      expect(payload.missing).toEqual(['--yes']);
      expect(
        payload.next?.some((n: { command: string }) =>
          /web-analytics disable/.test(n.command)
        )
      ).toBe(true);
      expect(apiCalled).toBe(false);
    });

    it('enables with --yes for a personal project', async () => {
      useUser({ billing: billing('pro') });
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      const confirmSpy = vi.spyOn(client.input, 'confirm');

      const bodies: unknown[] = [];
      client.scenario.post('/web/insights/toggle', (req, res) => {
        bodies.push(req.body);
        res.json({ value: true });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'enable',
        'my-project',
        '--yes',
        '--non-interactive'
      );

      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(bodies).toEqual([{ value: true }]);
      expect(confirmSpy).not.toHaveBeenCalled();
      await expect(client.stderr).toOutput('Web Analytics is enabled');
    });

    it('enables a paid team project without --scope', async () => {
      useUser();
      client.config.currentTeam = 'team_wa';
      client.scenario.get('/teams/team_wa', (_req, res) => {
        res.json({
          id: 'team_wa',
          slug: 'wa-team',
          name: 'WA Team',
          billing: { plan: 'pro' },
        });
      });
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
        accountId: 'team_wa',
      });

      let teamId: unknown;
      client.scenario.post('/web/insights/toggle', (req, res) => {
        teamId = req.query.teamId;
        res.json({ value: true });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'enable',
        'my-project',
        '--non-interactive'
      );

      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(teamId).toBe('team_wa');
    });

    it('requires --scope with --yes to disable on a paid team project', async () => {
      useUser();
      client.config.currentTeam = 'team_wa';
      client.scenario.get('/teams/team_wa', (_req, res) => {
        res.json({
          id: 'team_wa',
          slug: 'wa-team',
          name: 'WA Team',
          billing: { plan: 'pro' },
        });
      });
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
        accountId: 'team_wa',
      });
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      let apiCalled = false;
      client.scenario.post('/web/insights/toggle', (_req, res) => {
        apiCalled = true;
        res.json({ value: false });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'disable',
        'my-project',
        '--yes',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_scope',
        missing: ['--scope'],
        userActionRequired: true,
      });
      expect(payload.next[0].command).toMatch(
        /^vercel project web-analytics disable my-project --yes --scope wa-team\b/
      );
      expect(apiCalled).toBe(false);
    });

    it("sends the toggle to a linked project's team, not the current scope", async () => {
      useUser();
      client.config.currentTeam = 'team_current';
      client.scenario.get('/teams/team_wa', (_req, res) => {
        res.json({
          id: 'team_wa',
          slug: 'wa-team',
          name: 'WA Team',
          billing: { plan: 'pro' },
        });
      });
      useProject({
        ...defaultProject,
        id: 'prj_wa',
        name: 'wa-project',
        accountId: 'team_wa',
      });
      const cwd = setupTmpDir();
      await outputFile(
        join(cwd, '.vercel', 'project.json'),
        JSON.stringify({ orgId: 'team_wa', projectId: 'prj_wa' })
      );
      const prevCwd = client.cwd;
      client.cwd = cwd;
      vi.stubEnv('VERCEL_ORG_ID', 'team_wa');
      vi.stubEnv('VERCEL_PROJECT_ID', 'prj_wa');

      let teamId: unknown;
      client.scenario.post('/web/insights/toggle', (req, res) => {
        teamId = req.query.teamId;
        res.json({ value: true });
      });

      client.nonInteractive = true;
      client.setArgv('project', 'web-analytics', 'enable', '--non-interactive');

      try {
        const exitCode = await project(client);
        expect(exitCode).toBe(0);
        expect(teamId).toBe('team_wa');
        await expect(client.stderr).toOutput(
          'Web Analytics is enabled for wa-project on team wa-team.'
        );
        expect(client.stderr.getFullOutput()).toContain(
          'wa-project belongs to team wa-team, not your current team. Using team wa-team.'
        );
      } finally {
        client.cwd = prevCwd;
        vi.unstubAllEnvs();
      }
    });
  });
  describe('linked project owned by another team than the current scope', () => {
    let prevCwd: string;

    beforeEach(async () => {
      teamCache.clear();
      useUser();
      client.config.currentTeam = 'team_current';
      client.scenario.get('/teams/team_wa', (_req, res) => {
        res.json({
          id: 'team_wa',
          slug: 'wa-team',
          name: 'WA Team',
          billing: { plan: 'pro' },
        });
      });
      useProject({
        ...defaultProject,
        id: 'prj_wa',
        name: 'wa-project',
        accountId: 'team_wa',
      });
      const cwd = setupTmpDir();
      await outputFile(
        join(cwd, '.vercel', 'project.json'),
        JSON.stringify({ orgId: 'team_wa', projectId: 'prj_wa' })
      );
      prevCwd = client.cwd;
      client.cwd = cwd;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      client.cwd = prevCwd;
      client.config.currentTeam = undefined;
      client.nonInteractive = false;
    });

    function trackToggle() {
      const calls: unknown[] = [];
      client.scenario.post('/web/insights/toggle', (req, res) => {
        calls.push(req.body);
        res.json({ value: (req.body as { value: boolean }).value });
      });
      return calls;
    }

    it.each([
      ['enable'],
      ['disable'],
    ])('refuses to %s in a terminal when --scope names another team, without prompting', async action => {
      // The CLI entry point sets currentTeam from --scope; here it stays
      // team_current, as if `--scope current-team` was passed.
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);
      const calls = trackToggle();

      client.setArgv(
        'project',
        'web-analytics',
        action,
        '--scope',
        'current-team'
      );
      const exitCode = await project(client);

      expect(exitCode).toBe(1);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      await expect(client.stderr).toOutput('Nothing was changed.');
      expect(client.stderr.getFullOutput()).toContain(
        "names a different account than the project's owner, team wa-team"
      );
    });

    it('names the team that owns the project in the disable prompt', async () => {
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(false);
      const calls = trackToggle();

      client.setArgv('project', 'web-analytics', 'disable');
      const exitCode = await project(client);

      expect(exitCode).toBe(0);
      expect(confirmSpy).toHaveBeenCalledWith(
        'Disable Web Analytics for wa-project on team wa-team?',
        false
      );
      expect(calls).toEqual([]);
    });

    it('leaves the warning out of --json runs', async () => {
      trackToggle();

      client.nonInteractive = true;
      client.setArgv('project', 'web-analytics', 'enable', '--json');
      const exitCode = await project(client);

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        enabled: true,
        projectId: 'prj_wa',
        projectName: 'wa-project',
      });
      expect(client.stderr.getFullOutput()).not.toContain('belongs to');
    });
  });

  describe('--yes in a terminal', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.config.currentTeam = undefined;
    });

    it('skips the disable prompt for a personal project', async () => {
      useUser();
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      const confirmSpy = vi.spyOn(client.input, 'confirm');
      client.scenario.post('/web/insights/toggle', (_req, res) => {
        res.json({ value: false });
      });

      client.setArgv(
        'project',
        'web-analytics',
        'disable',
        'my-project',
        '--yes'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(confirmSpy).not.toHaveBeenCalled();
      await expect(client.stderr).toOutput('Web Analytics is disabled');
    });

    it('still prompts to disable a paid team project without --scope', async () => {
      teamCache.clear();
      useUser();
      client.config.currentTeam = 'team_wa';
      client.scenario.get('/teams/team_wa', (_req, res) => {
        res.json({
          id: 'team_wa',
          slug: 'wa-team',
          name: 'WA Team',
          billing: { plan: 'pro' },
        });
      });
      useProject({
        ...defaultProject,
        id: 'prj_wa',
        name: 'wa-project',
        accountId: 'team_wa',
      });
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);
      client.scenario.post('/web/insights/toggle', (_req, res) => {
        res.json({ value: false });
      });

      client.setArgv(
        'project',
        'web-analytics',
        'disable',
        'wa-project',
        '--yes'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(confirmSpy).toHaveBeenCalled();
    });
  });
});
