import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@vercel-internals/types';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useUnknownProject } from '../../../mocks/project';

/**
 * Registers only the project GET endpoint used by `getProjectByNameOrId`, so
 * each test can register its own PATCH handler (the shared `useProject` mock
 * registers a permissive PATCH that would otherwise shadow assertions).
 */
function usePassportProject(): Project {
  const currentProject: Project = {
    ...defaultProject,
    id: 'prj_123',
    name: 'my-project',
  };
  client.scenario.get('/v9/projects/:idOrName', (req, res) => {
    if (
      req.params.idOrName !== currentProject.id &&
      req.params.idOrName !== currentProject.name
    ) {
      return res.status(404).send();
    }
    res.json(currentProject);
  });
  return currentProject;
}

describe('project passport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('assigns a Passport application to a named project', async () => {
    usePassportProject();

    let requestBody: unknown;
    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      requestBody = req.body;
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'passport',
      'set',
      'my-project',
      '--connector',
      'con_123'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(requestBody).toEqual({ passport: { connectorId: 'con_123' } });
    await expect(client.stderr).toOutput('Passport is enabled for my-project.');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:passport',
        value: 'passport set',
      },
      {
        key: 'option:connector',
        value: '[REDACTED]',
      },
    ]);
  });

  it('outputs JSON with --format json for set', async () => {
    usePassportProject();

    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'passport',
      'set',
      'my-project',
      '--connector',
      'con_123',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      enabled: true,
      connectorId: 'con_123',
      projectId: 'prj_123',
      projectName: 'my-project',
    });
  });

  it('returns 2 when set is missing --connector', async () => {
    usePassportProject();

    let patched = false;
    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      patched = true;
      res.json({ id: 'prj_123' });
    });

    client.setArgv('project', 'passport', 'set', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    expect(patched).toBe(false);
    await expect(client.stderr).toOutput('The `--connector <id>` option is');
  });

  it('returns 2 when the action is missing or invalid', async () => {
    client.setArgv('project', 'passport');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Usage: `vercel project passport set|disable [name] [--connector <id>]`'
    );
  });

  it('returns 2 when too many arguments are passed', async () => {
    client.setArgv('project', 'passport', 'set', 'a', 'b');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput(
      'Usage: `vercel project passport set [name]`'
    );
  });

  it('disables Passport after confirmation', async () => {
    usePassportProject();

    let requestBody: unknown;
    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      requestBody = req.body;
      res.json({ id: 'prj_123' });
    });

    client.setArgv('project', 'passport', 'disable', 'my-project');
    const exitCodePromise = project(client);

    await expect(client.stderr).toOutput('turns off access protection');
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    expect(requestBody).toEqual({ passport: null });
    await expect(client.stderr).toOutput(
      'Passport is disabled for my-project.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:passport',
        value: 'passport disable',
      },
    ]);
  });

  it('disables Passport without confirmation when --yes is set', async () => {
    usePassportProject();

    let method: string | undefined;
    let requestBody: unknown;
    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      method = req.method;
      requestBody = req.body;
      res.json({ id: 'prj_123' });
    });

    client.setArgv('project', 'passport', 'disable', 'my-project', '--yes');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('PATCH');
    expect(requestBody).toEqual({ passport: null });
    await expect(client.stderr).toOutput(
      'Passport is disabled for my-project.'
    );
  });

  it('cancels disable when the confirmation is declined', async () => {
    usePassportProject();

    let patched = false;
    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      patched = true;
      res.json({ id: 'prj_123' });
    });

    client.setArgv('project', 'passport', 'disable', 'my-project');
    const exitCodePromise = project(client);

    await expect(client.stderr).toOutput('turns off access protection');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    expect(patched).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('returns 1 when the project is not found', async () => {
    useUnknownProject();

    client.setArgv(
      'project',
      'passport',
      'set',
      'does-not-exist',
      '--connector',
      'con_123'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('does-not-exist');
  });

  describe('--non-interactive', () => {
    it('requires confirmation before disabling', async () => {
      usePassportProject();

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      let patched = false;
      client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
        patched = true;
        res.json({ id: 'prj_123' });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'passport',
        'disable',
        'my-project',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
      });
      expect(
        payload.next?.some((n: { command: string }) => /--yes/.test(n.command))
      ).toBe(true);
      expect(patched).toBe(false);
    });

    it('outputs error JSON when the API returns 403 for set', async () => {
      usePassportProject();

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Passport not allowed.',
          },
        });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'passport',
        'set',
        'my-project',
        '--connector',
        'con_123',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: 'Passport not allowed.',
      });
      expect(
        payload.next?.some((n: { command: string }) =>
          /passport/.test(n.command)
        )
      ).toBe(true);
    });

    it('outputs link_required JSON when no project name and directory is not linked', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'vc-cli-passport-unlinked-'));
      const prevCwd = client.cwd;
      client.cwd = emptyDir;

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'passport',
        'set',
        '--connector',
        'con_123',
        '--non-interactive'
      );

      try {
        await expect(project(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'link_required',
        });
      } finally {
        client.cwd = prevCwd;
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
