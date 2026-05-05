import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

const encodedHeader = Buffer.from(
  JSON.stringify({ alg: 'RS256', typ: 'JWT' })
).toString('base64url');
const encodedPayload = Buffer.from(
  JSON.stringify({
    iss: 'https://vercel.com',
    aud: 'https://example.com',
    sub: 'project:prj_test',
    exp: 1893456000,
  })
).toString('base64url');
const oidcToken = `${encodedHeader}.${encodedPayload}.signature`;

function useProjectToken() {
  const { project } = useProject({
    ...defaultProject,
    id: 'prj_test',
    name: 'test_project',
  });

  client.scenario.post(`/projects/${project.id}/token`, (_req, res) => {
    res.json({ token: oidcToken });
  });

  return project;
}

describe('project token', () => {
  it('prints the raw OIDC token by default', async () => {
    const projectData = useProjectToken();

    client.setArgv('project', 'token', projectData.name!);
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toBe(`${oidcToken}\n`);
  });

  it('prints decoded OIDC token JSON with --decode', async () => {
    const projectData = useProjectToken();

    client.setArgv('project', 'token', projectData.name!, '--decode');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stderr.getFullOutput())).toEqual({
      header: {
        alg: 'RS256',
        typ: 'JWT',
      },
      payload: {
        iss: 'https://vercel.com',
        aud: 'https://example.com',
        sub: 'project:prj_test',
        exp: 1893456000,
      },
    });
    expect(client.stderr.getFullOutput()).not.toContain(oidcToken);
  });
});
