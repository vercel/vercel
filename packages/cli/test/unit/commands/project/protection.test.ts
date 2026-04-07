import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (skew)', () => {
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

  it('requires --skew for action mode', async () => {
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

  it('enables skew protection via skewProtectionMaxAge', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ skewProtectionMaxAge: 2592000 });
      res.json({ id: 'prj_123' });
    });

    client.setArgv('project', 'protection', 'enable', 'my-project', '--skew');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });
});
