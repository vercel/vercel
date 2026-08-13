import { mkdtempSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outputFile } from 'fs-extra';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('project web-analytics', () => {
  it('enables Web Analytics for a named project', async () => {
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
    const exitCode = await project(client);
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
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Web Analytics is disabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:web-analytics',
        value: 'web-analytics disable',
      },
    ]);
  });

  it('enables Web Analytics with an explicit enable action', async () => {
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
    const exitCode = await project(client);
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
      const exitCode = await project(client);
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

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('outputs error JSON when the toggle API returns 403', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.post('/web/insights/toggle', (_req, res) => {
        res.status(403).json({
          error: { code: 'forbidden', message: 'Web Analytics not allowed.' },
        });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'my-project',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: 'Web Analytics not allowed.',
      });
      expect(
        payload.next?.some((n: { command: string }) =>
          /web-analytics/.test(n.command)
        )
      ).toBe(true);
    });

    it('outputs link_required JSON when no project name and directory is not linked', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'vc-cli-wa-unlinked-'));
      const prevCwd = client.cwd;
      client.cwd = emptyDir;

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('project', 'web-analytics', '--non-interactive');

      try {
        await expect(project(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'link_required',
        });
        expect(
          payload.next?.some((n: { command: string }) =>
            /web-analytics/.test(n.command)
          )
        ).toBe(true);
      } finally {
        client.cwd = prevCwd;
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
