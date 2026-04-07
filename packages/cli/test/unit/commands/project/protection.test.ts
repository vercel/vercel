import { afterEach, describe, expect, it, vi } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (SSO)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires --sso for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('disables SSO protection when --sso is set', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ ssoProtection: null });
      res.json({ id: 'prj_123' });
    });

    client.setArgv('project', 'protection', 'disable', 'my-project', '--sso');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Deployment protection disabled');
  });

  it('returns JSON for enable with --sso', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--sso',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      ssoProtection: true,
    });
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('outputs missing_arguments JSON when enable has no protection flag', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'protection',
        'enable',
        'my-project',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:2');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(payload.message).toMatch(/No protection selected/);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project protection.*--sso/.test(n.command)
        )
      ).toBe(true);
    });

    it('outputs JSON when listing protection settings without --format', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'protection',
        'my-project',
        '--non-interactive'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload.projectId).toBe('prj_123');
      expect(payload.name).toBe('my-project');
    });
  });
});
