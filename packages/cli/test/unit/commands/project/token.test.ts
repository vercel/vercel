import { describe, expect, it, vi } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';

vi.mock('../../../../src/util/agent/auto-install-agentic', () => ({
  autoInstallVercelPlugin: vi.fn(),
}));

describe('project token', () => {
  it('prints the OIDC token to stdout for a named project', async () => {
    useUser();
    useProject(defaultProject);
    const token = 'oidc-token-for-command-substitution';
    let requestBody: unknown;

    client.scenario.post(`/projects/${defaultProject.id}/token`, (req, res) => {
      requestBody = req.body;
      res.json({ token });
    });

    client.setArgv('project', 'token', defaultProject.name!);
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(`${token}\n`);
    expect(client.stderr.getFullOutput()).not.toContain(token);
    expect(requestBody).toEqual({ source: 'vercel-cli' });
  });

  it('prints API errors to stderr without writing a token to stdout', async () => {
    useUser();
    useProject(defaultProject);

    client.scenario.post(
      `/projects/${defaultProject.id}/token`,
      (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Project token generation is forbidden.',
          },
        });
      }
    );

    client.setArgv('project', 'token', defaultProject.name!);
    const exitCode = await project(client);

    expect(exitCode).toBe(1);
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toContain(
      'Project token generation is forbidden.'
    );
  });
});
