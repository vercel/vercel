import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { outputFile } from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('project observability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('enables Observability Plus for a named project', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

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

  it('disables Observability Plus for a named project', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

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

  it('outputs JSON with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

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

  it('returns 2 when the action is missing or invalid', async () => {
    client.setArgv('project', 'observability');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Usage: `vercel project observability enable|disable [name]`'
    );
  });

  it('returns 2 when the action is not enable or disable', async () => {
    client.setArgv('project', 'observability', 'bogus');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Usage: `vercel project observability enable|disable [name]`'
    );
  });

  it('returns 2 when too many arguments are passed', async () => {
    client.setArgv('project', 'observability', 'enable', 'a', 'b');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Usage: `vercel project observability enable [name]`'
    );
  });

  it('returns 1 when the project is not found', async () => {
    useUnknownProject();

    client.setArgv('project', 'observability', 'enable', 'does-not-exist');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('does-not-exist');
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

  describe('--non-interactive', () => {
    it('outputs error JSON when the API returns 403', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.put(
        '/v1/observability/manage/configuration/projects/:projectIdOrName',
        (_req, res) => {
          res.status(403).json({
            error: {
              code: 'forbidden',
              message: 'Observability Plus not allowed.',
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

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: 'Observability Plus not allowed.',
      });
      expect(
        payload.next?.some((n: { command: string }) =>
          /observability/.test(n.command)
        )
      ).toBe(true);
    });

    it('outputs link_required JSON when no project name and directory is not linked', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'vc-cli-obs-unlinked-'));
      const prevCwd = client.cwd;
      client.cwd = emptyDir;

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('project', 'observability', 'enable', '--non-interactive');

      try {
        await expect(project(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'link_required',
        });
        expect(
          payload.next?.some((n: { command: string }) =>
            /observability/.test(n.command)
          )
        ).toBe(true);
      } finally {
        client.cwd = prevCwd;
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
