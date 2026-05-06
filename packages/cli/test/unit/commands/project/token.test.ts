import { afterEach, describe, it, expect, vi } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';

describe('project token', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prints the token to stdout by default', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_test123',
      name: 'my-project',
    });

    let requestBody: unknown;
    client.scenario.post('/projects/:projectId/token', (req, res) => {
      requestBody = req.body;
      res.json({ token: 'oidc-token' });
    });

    client.setArgv('project', 'token', 'my-project');

    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe('oidc-token\n');
    expect(requestBody).toEqual({ source: 'vercel-cli' });
  });

  it('supports JSON output', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_test123',
      name: 'my-project',
    });

    client.scenario.post('/projects/:projectId/token', (_req, res) => {
      res.json({ token: 'oidc-token' });
    });

    client.setArgv('project', 'token', 'my-project', '--format=json');

    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
      token: 'oidc-token',
    });
  });
});
