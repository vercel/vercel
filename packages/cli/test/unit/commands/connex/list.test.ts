import { describe, beforeEach, expect, it } from 'vitest';
import { join } from 'path';
import { mkdirp, writeJSON } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import connex from '../../../../src/commands/connex';

async function linkProjectInCwd(
  team: { id: string },
  project: { id: string; name: string }
): Promise<string> {
  const cwd = setupTmpDir();
  await mkdirp(join(cwd, '.vercel'));
  await writeJSON(join(cwd, '.vercel', 'project.json'), {
    orgId: team.id,
    projectId: project.id,
    projectName: project.name,
  });
  client.cwd = cwd;
  return cwd;
}

describe('connex list', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  describe('without --all (project-scoped)', () => {
    it('should error when no project is linked', async () => {
      client.setArgv('connex', 'list');

      const exitCode = await connex(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('No project linked');
    });

    it('should request clients filtered by the linked projectId', async () => {
      const project = {
        ...defaultProject,
        id: 'proj_linked_1',
        name: 'my-app',
      };
      useProject(project);
      await linkProjectInCwd(team, project);

      let requestUrl = '';
      client.scenario.get('/v1/connex/clients', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({
          clients: [
            {
              id: 'scl_abc123',
              uid: 'slack/my-bot',
              name: 'My Bot',
              type: 'slack',
              typeName: 'Slack',
              createdAt: Date.now() - 60_000,
            },
          ],
        });
      });

      client.setArgv('connex', 'list');

      const exitCode = await connex(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain(`projectId=${project.id}`);
      expect(requestUrl).not.toContain('include=projects');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Connex clients linked to');
      expect(stderr).toContain(project.name);
      expect(stderr).toContain('slack/my-bot');
    });

    it('should show empty-state with project name when no clients are linked', async () => {
      const project = {
        ...defaultProject,
        id: 'proj_linked_2',
        name: 'empty-app',
      };
      useProject(project);
      await linkProjectInCwd(team, project);

      client.scenario.get('/v1/connex/clients', (_req, res) => {
        res.json({ clients: [] });
      });

      client.setArgv('connex', 'list');

      const exitCode = await connex(client);

      expect(exitCode).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('No Connex clients linked to');
      expect(stderr).toContain(project.name);
      expect(stderr).toContain('--all');
    });
  });

  describe('with --all', () => {
    it('should request clients with include=projects', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connex/clients', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({
          clients: [
            {
              id: 'scl_abc123',
              uid: 'slack/my-bot',
              name: 'My Bot',
              type: 'slack',
              typeName: 'Slack',
              createdAt: Date.now() - 60_000,
              projects: [
                { id: 'proj_1', name: 'web' },
                { id: 'proj_2', name: 'docs' },
              ],
            },
          ],
        });
      });

      client.setArgv('connex', 'list', '--all');

      const exitCode = await connex(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('include=projects');
      expect(requestUrl).not.toContain('projectId=');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Projects');
      expect(stderr).toContain('web, docs');
    });

    it('should render empty-state without project context', async () => {
      client.scenario.get('/v1/connex/clients', (_req, res) => {
        res.json({ clients: [] });
      });

      client.setArgv('connex', 'list', '--all');

      const exitCode = await connex(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'No Connex clients found'
      );
    });

    it('should show friendly error when connex feature flag is off (404)', async () => {
      client.scenario.get('/v1/connex/clients', (_req, res) => {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found', message: 'Not Found' } });
      });

      client.setArgv('connex', 'list', '--all');

      const exitCode = await connex(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Connex is not enabled');
    });

    it('should output JSON with projects when --format=json is used', async () => {
      client.scenario.get('/v1/connex/clients', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_xyz',
              uid: 'oauth/my-client',
              name: 'My OAuth',
              type: 'oauth',
              typeName: 'OAuth',
              createdAt: 1_700_000_000_000,
              projects: [{ id: 'proj_1', name: 'web' }],
            },
          ],
          cursor: 'next-page',
        });
      });

      client.setArgv('connex', 'list', '--all', '--format=json');

      const exitCode = await connex(client);

      expect(exitCode).toBe(0);
      const stdout = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.cursor).toBe('next-page');
      expect(parsed.clients).toHaveLength(1);
      const [first] = parsed.clients;
      expect(Object.keys(first)[0]).toBe('uid');
      expect(first.uid).toBe('oauth/my-client');
      expect(first.projects).toEqual([{ id: 'proj_1', name: 'web' }]);
    });

    it('should print --all in next-page hint when the response has a cursor', async () => {
      client.scenario.get('/v1/connex/clients', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_1',
              uid: 'slack/a',
              name: 'A',
              type: 'slack',
              typeName: 'Slack',
              createdAt: Date.now(),
              projects: [],
            },
          ],
          cursor: 'cursor-abc',
        });
      });

      client.setArgv('connex', 'list', '--all');

      const exitCode = await connex(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'connex list --all --next cursor-abc'
      );
    });

    it('should forward --limit and --next as query params', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connex/clients', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({ clients: [] });
      });

      client.setArgv(
        'connex',
        'list',
        '--all',
        '--limit',
        '5',
        '--next',
        'prev-cursor'
      );

      const exitCode = await connex(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('limit=5');
      expect(requestUrl).toContain('cursor=prev-cursor');
      expect(requestUrl).toContain('include=projects');
    });
  });

  it('should output JSON for project-scoped list without projects field', async () => {
    const project = { ...defaultProject, id: 'proj_json_1', name: 'json-app' };
    useProject(project);
    await linkProjectInCwd(team, project);

    client.scenario.get('/v1/connex/clients', (_req, res) => {
      res.json({
        clients: [
          {
            id: 'scl_xyz',
            uid: 'oauth/my-client',
            name: 'My OAuth',
            type: 'oauth',
            typeName: 'OAuth',
            createdAt: 1_700_000_000_000,
          },
        ],
      });
    });

    client.setArgv('connex', 'list', '--format=json');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.clients).toHaveLength(1);
    const [first] = parsed.clients;
    expect(first.uid).toBe('oauth/my-client');
    expect(first).not.toHaveProperty('projects');
  });
});
