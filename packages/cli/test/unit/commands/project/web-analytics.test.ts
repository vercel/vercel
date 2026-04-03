import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';
import { installVercelWebAnalyticsPackage } from '../../../../src/util/install-vercel-web-analytics-package';

vi.mock(
  '../../../../src/util/install-vercel-web-analytics-package',
  async () => {
    const actual = await vi.importActual<
      typeof import('../../../../src/util/install-vercel-web-analytics-package')
    >('../../../../src/util/install-vercel-web-analytics-package');
    return {
      ...actual,
      installVercelWebAnalyticsPackage: vi.fn(),
    };
  }
);

describe('project web-analytics', () => {
  beforeEach(() => {
    vi.mocked(installVercelWebAnalyticsPackage).mockReset();
  });
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
    expect(installVercelWebAnalyticsPackage).not.toHaveBeenCalled();
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
    expect(installVercelWebAnalyticsPackage).not.toHaveBeenCalled();
  });

  describe('--auto-install', () => {
    afterEach(() => {
      client.nonInteractive = false;
    });

    it('runs install after enable and logs integration hints', async () => {
      vi.mocked(installVercelWebAnalyticsPackage).mockResolvedValue({
        ran: true,
        success: true,
        command: 'pnpm add @vercel/analytics',
      });

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
        '--auto-install'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(installVercelWebAnalyticsPackage).toHaveBeenCalledWith({
        cwd: client.cwd,
        pipeStdio: false,
      });
      await expect(client.stderr).toOutput('Installed @vercel/analytics');
      await expect(client.stderr).toOutput('Analytics component');
    });

    it('includes packageInstall and integrate in JSON output', async () => {
      vi.mocked(installVercelWebAnalyticsPackage).mockResolvedValue({
        ran: true,
        success: true,
        command: 'pnpm add @vercel/analytics',
      });

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
        '--auto-install',
        '--format',
        'json'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
      expect(jsonOutput.enabled).toBe(true);
      expect(jsonOutput.projectId).toBe('prj_123');
      expect(jsonOutput.packageInstall).toEqual({
        ran: true,
        success: true,
        command: 'pnpm add @vercel/analytics',
      });
      expect(jsonOutput.integrate).toMatchObject({
        docsUrl: 'https://vercel.com/docs/analytics/quickstart',
        summary: expect.stringContaining('Analytics'),
        nextExample: expect.stringContaining('@vercel/analytics/next'),
      });
    });

    it('exits 1 and prints install error when install fails', async () => {
      vi.mocked(installVercelWebAnalyticsPackage).mockResolvedValue({
        ran: true,
        success: false,
        command: 'pnpm add @vercel/analytics',
        error: 'install failed',
      });

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
        '--auto-install'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('install failed');
    });

    it('pipes install stdio when --non-interactive', async () => {
      vi.mocked(installVercelWebAnalyticsPackage).mockResolvedValue({
        ran: true,
        success: true,
        command: 'pnpm add @vercel/analytics',
      });

      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      client.scenario.post('/web/insights/toggle', (_req, res) => {
        res.json({ value: true });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'web-analytics',
        'my-project',
        '--auto-install',
        '--non-interactive'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(installVercelWebAnalyticsPackage).toHaveBeenCalledWith({
        cwd: client.cwd,
        pipeStdio: true,
      });
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
