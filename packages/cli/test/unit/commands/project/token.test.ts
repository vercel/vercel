import { afterEach, describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
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

  it('uses linked project accountId for the token request', async () => {
    const team = useTeam('team_linked');
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_linked',
      name: 'linked-project',
      accountId: team.id,
    });

    // Simulate the user being on a different team
    client.config.currentTeam = 'team_current';

    const cwd = setupTmpDir();
    await outputFile(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ orgId: team.id, projectId: 'prj_linked' })
    );
    client.cwd = cwd;

    let requestBody: unknown;
    client.scenario.post('/projects/:projectId/token', (req, res) => {
      requestBody = req.body;
      res.json({ token: 'oidc-token' });
    });

    const fetchSpy = vi.spyOn(client, 'fetch');

    client.setArgv('project', 'token');

    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe('oidc-token\n');
    expect(requestBody).toEqual({ source: 'vercel-cli' });

    // Verify the POST request was made with the project's accountId
    const postCall = fetchSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('/token')
    );
    expect(postCall).toBeDefined();
    expect(postCall![1]).toMatchObject({ accountId: team.id });

    fetchSpy.mockRestore();
  });
});
