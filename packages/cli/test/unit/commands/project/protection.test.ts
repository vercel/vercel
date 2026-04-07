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

  it('includes skewProtectionMaxAge when listing project protection as JSON', async () => {
    const projectWithSkew = {
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      skewProtectionMaxAge: 2592000,
    };
    useProject(projectWithSkew as any);

    client.setArgv('project', 'protection', 'my-project', '--format', 'json');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.skewProtectionMaxAge).toBe(2592000);
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

  it('enables skew protection with custom --skew-max-age (seconds)', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ skewProtectionMaxAge: 604800 });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--skew',
      '--skew-max-age',
      '604800'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });

  it('rejects disable with --skew-max-age', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--skew',
      '--skew-max-age',
      '604800'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('skew-max-age');
  });

  it('rejects invalid --skew-max-age', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--skew',
      '--skew-max-age',
      'not-a-number'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Invalid --skew-max-age');
  });
});
