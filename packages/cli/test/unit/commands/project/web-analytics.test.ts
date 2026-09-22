import { basename, join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outputFile } from 'fs-extra';
import type { User } from '@vercel-internals/types';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

const LIMITS_DOCS_URL = 'https://vercel.com/docs/analytics/limits-and-pricing';

function billing(plan: string): User['billing'] {
  return { plan } as User['billing'];
}

describe('project web-analytics', () => {
  it('enables Web Analytics for a named project', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/web/insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: true });
      res.json({ value: true });
    });

    client.setArgv('project', 'web-analytics', 'my-project');
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will incur charges');
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is enabled');
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
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will incur charges');
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
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
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will incur charges');
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is enabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:web-analytics',
        value: 'web-analytics enable',
      },
    ]);
  });

  it('does not enable when the user declines the confirmation', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    let apiCalled = false;
    client.scenario.post('/web/insights/toggle', (_req, res) => {
      apiCalled = true;
      res.json({ value: true });
    });

    client.setArgv('project', 'web-analytics', 'enable', 'my-project');
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput('will incur charges');
    client.stdin.write('n\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Canceled');
    expect(apiCalled).toBe(false);
  });

  it('shows the free-with-limits notice for Hobby projects instead of a charges warning', async () => {
    useUser({ billing: billing('hobby') });
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
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput(
      `Web Analytics is free for my-project with limits documented on ${LIMITS_DOCS_URL}.`
    );
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is enabled');
    expect(client.stderr.getFullOutput()).not.toContain('will incur charges');
  });

  it('reads the team billing plan when deciding the enable notice', async () => {
    useUser();
    client.config.currentTeam = 'team_hobby';
    client.scenario.get('/teams/team_hobby', (_req, res) => {
      res.json({
        id: 'team_hobby',
        slug: 'hobby-team',
        name: 'Hobby Team',
        creatorId: 'user_1',
        created: '2017-04-29T17:21:54.514Z',
        avatar: null,
        billing: { plan: 'hobby' },
      });
    });
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/web/insights/toggle', (_req, res) => {
      res.json({ value: true });
    });

    client.setArgv('project', 'web-analytics', 'enable', 'my-project');
    const exitCodePromise = project(client);
    await expect(client.stderr).toOutput(
      `Web Analytics is free for my-project with limits documented on ${LIMITS_DOCS_URL}.`
    );
    client.stdin.write('y\n');
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is enabled');
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

    it('refuses to enable non-interactively with a paid-feature action_required payload', async () => {
      useUser({ billing: billing('pro') });
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      let apiCalled = false;
      client.scenario.post('/web/insights/toggle', (_req, res) => {
        apiCalled = true;
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

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
      });
      expect(payload.message).toContain('will incur charges');
      expect(payload.message).not.toContain(LIMITS_DOCS_URL);
      expect(
        payload.next?.some((n: { command: string }) =>
          /web-analytics enable/.test(n.command)
        )
      ).toBe(true);
      expect(apiCalled).toBe(false);
    });

    it('surfaces the free-with-limits notice non-interactively for Hobby projects', async () => {
      useUser({ billing: billing('hobby') });
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      let apiCalled = false;
      client.scenario.post('/web/insights/toggle', (_req, res) => {
        apiCalled = true;
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

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
      });
      expect(payload.message).toContain('free with limits');
      expect(payload.message).toContain(LIMITS_DOCS_URL);
      expect(payload.message).not.toContain('incur charges');
      expect(apiCalled).toBe(false);
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
      expect(payload.message).toContain('stops data collection');
      expect(
        payload.next?.some((n: { command: string }) =>
          /web-analytics disable/.test(n.command)
        )
      ).toBe(true);
      expect(apiCalled).toBe(false);
    });
  });
});
