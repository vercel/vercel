import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { outputFile } from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('project speed-insights', () => {
  it('enables Speed Insights for a named project', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/speed-insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: true });
      res.json({ value: true });
    });

    client.setArgv('project', 'speed-insights', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Speed Insights is enabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:speed-insights',
        value: 'speed-insights',
      },
    ]);
  });

  it('enables Speed Insights with the explicit `enable` action', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/speed-insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: true });
      res.json({ value: true });
    });

    client.setArgv('project', 'speed-insights', 'enable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Speed Insights is enabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:speed-insights',
        value: 'speed-insights enable',
      },
    ]);
  });

  it('disables Speed Insights for a named project', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.post('/speed-insights/toggle', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      expect(req.body).toEqual({ value: false });
      res.json({ value: false });
    });

    client.setArgv('project', 'speed-insights', 'disable', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Speed Insights is disabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:speed-insights',
        value: 'speed-insights disable',
      },
    ]);
  });

  it('outputs JSON when disabling with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

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

  it('outputs JSON with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

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

      client.scenario.post('/speed-insights/toggle', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Speed Insights not allowed.',
          },
        });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'speed-insights',
        'my-project',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: 'Speed Insights not allowed.',
      });
      expect(
        payload.next?.some((n: { command: string }) =>
          /speed-insights/.test(n.command)
        )
      ).toBe(true);
    });

    it('outputs link_required JSON when no project name and directory is not linked', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'vc-cli-si-unlinked-'));
      const prevCwd = client.cwd;
      client.cwd = emptyDir;

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('project', 'speed-insights', '--non-interactive');

      try {
        await expect(project(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'link_required',
        });
        expect(
          payload.next?.some((n: { command: string }) =>
            /speed-insights/.test(n.command)
          )
        ).toBe(true);
      } finally {
        client.cwd = prevCwd;
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
