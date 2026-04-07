import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection', () => {
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

  it('requires explicit protection selector for action mode', async () => {
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

  it('disables only password protection when --password is set', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({
        passwordProtection: null,
      });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--password'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Deployment protection disabled');
  });

  it('returns JSON for action mode with --format json', async () => {
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
});
