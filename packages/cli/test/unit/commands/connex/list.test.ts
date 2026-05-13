import { describe, beforeEach, expect, it } from 'vitest';
import { join } from 'path';
import { mkdirp, writeJSON } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import connect from '../../../../src/commands/connex';

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

  describe('default (project-scoped when linked)', () => {
    it('should request clients filtered by the linked projectId', async () => {
      const project = {
        ...defaultProject,
        id: 'proj_linked_1',
        name: 'my-app',
      };
      useProject(project);
      await linkProjectInCwd(team, project);

      let requestUrl = '';
      client.scenario.get('/v1/connect/clients', (req, res) => {
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

      client.setArgv('connect', 'list');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain(`projectId=${project.id}`);
      expect(requestUrl).not.toContain('include=projects');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Connectors linked to');
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

      client.scenario.get('/v1/connect/clients', (_req, res) => {
        res.json({ clients: [] });
      });

      client.setArgv('connect', 'list');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('No connectors linked to');
      expect(stderr).toContain(project.name);
      expect(stderr).toContain('--all-projects');
    });

    it('should fall back to unscoped list when no project is linked', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connect/clients', (req, res) => {
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
              includes: {
                projects: {
                  items: [
                    {
                      projectId: 'proj_1',
                      project: { id: 'proj_1', name: 'web' },
                    },
                  ],
                  hasMore: false,
                  cursor: null,
                },
              },
            },
          ],
        });
      });

      client.setArgv('connect', 'list');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('include=projects');
      expect(requestUrl).not.toContain('projectId=');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Projects');
      expect(stderr).toContain('web');
      expect(stderr).not.toContain('Connectors linked to');
    });
  });

  describe('with --all-projects', () => {
    it('should request clients with include=projects', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connect/clients', (req, res) => {
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
              includes: {
                projects: {
                  items: [
                    {
                      projectId: 'proj_1',
                      project: { id: 'proj_1', name: 'web' },
                    },
                    {
                      projectId: 'proj_2',
                      project: { id: 'proj_2', name: 'docs' },
                    },
                  ],
                  hasMore: false,
                  cursor: null,
                },
              },
            },
          ],
        });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('include=projects');
      expect(requestUrl).not.toContain('projectId=');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Projects');
      expect(stderr).toContain('web, docs');
      expect(stderr).not.toContain('+ more');
    });

    it('should append "+ more" when includes.projects.hasMore is true', async () => {
      client.scenario.get('/v1/connect/clients', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_abc123',
              uid: 'slack/my-bot',
              name: 'My Bot',
              type: 'slack',
              typeName: 'Slack',
              createdAt: Date.now() - 60_000,
              includes: {
                projects: {
                  items: [
                    {
                      projectId: 'proj_1',
                      project: { id: 'proj_1', name: 'web' },
                    },
                  ],
                  hasMore: true,
                  cursor: 'p_cursor',
                },
              },
            },
          ],
        });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('web');
      expect(stderr).toContain('+ more');
    });

    it('should skip deleted projects when rendering names', async () => {
      client.scenario.get('/v1/connect/clients', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_abc123',
              uid: 'slack/my-bot',
              name: 'My Bot',
              type: 'slack',
              typeName: 'Slack',
              createdAt: Date.now() - 60_000,
              includes: {
                projects: {
                  items: [
                    {
                      projectId: 'proj_live',
                      project: { id: 'proj_live', name: 'live-app' },
                    },
                    // deleted project — no `project` field
                    { projectId: 'proj_gone' },
                  ],
                  hasMore: false,
                  cursor: null,
                },
              },
            },
          ],
        });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('live-app');
      expect(stderr).not.toContain('proj_gone');
    });

    it('should render empty-state without project context', async () => {
      client.scenario.get('/v1/connect/clients', (_req, res) => {
        res.json({ clients: [] });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('No connectors found');
    });

    it('should show friendly error when connect feature flag is off (404)', async () => {
      client.scenario.get('/v1/connect/clients', (_req, res) => {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found', message: 'Not Found' } });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Connect is not enabled');
    });

    it('should output JSON with projects and hasMoreProjects when --format=json is used', async () => {
      client.scenario.get('/v1/connect/clients', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_xyz',
              uid: 'oauth/my-client',
              name: 'My OAuth',
              type: 'oauth',
              typeName: 'OAuth',
              createdAt: 1_700_000_000_000,
              includes: {
                projects: {
                  items: [
                    {
                      projectId: 'proj_1',
                      project: { id: 'proj_1', name: 'web' },
                    },
                    // deleted — gets dropped from json projects
                    { projectId: 'proj_gone' },
                  ],
                  hasMore: true,
                  cursor: 'p_cursor',
                },
              },
            },
          ],
          cursor: 'next-page',
        });
      });

      client.setArgv('connect', 'list', '--all-projects', '--format=json');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      const stdout = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.cursor).toBe('next-page');
      expect(parsed.clients).toHaveLength(1);
      const [first] = parsed.clients;
      expect(Object.keys(first)[0]).toBe('uid');
      expect(first.uid).toBe('oauth/my-client');
      expect(first.projects).toEqual([{ id: 'proj_1', name: 'web' }]);
      expect(first.hasMoreProjects).toBe(true);
    });

    it('should print --all-projects in next-page hint when the response has a cursor', async () => {
      client.scenario.get('/v1/connect/clients', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_1',
              uid: 'slack/a',
              name: 'A',
              type: 'slack',
              typeName: 'Slack',
              createdAt: Date.now(),
              includes: {
                projects: { items: [], hasMore: false, cursor: null },
              },
            },
          ],
          cursor: 'cursor-abc',
        });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'connect list --all-projects --next cursor-abc'
      );
    });

    it('should forward --limit and --next as query params', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connect/clients', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({ clients: [] });
      });

      client.setArgv(
        'connect',
        'list',
        '--all-projects',
        '--limit',
        '5',
        '--next',
        'prev-cursor'
      );

      const exitCode = await connect(client);

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

    client.scenario.get('/v1/connect/clients', (_req, res) => {
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

    client.setArgv('connect', 'list', '--format=json');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.clients).toHaveLength(1);
    const [first] = parsed.clients;
    expect(first.uid).toBe('oauth/my-client');
    expect(first).not.toHaveProperty('projects');
    expect(first).not.toHaveProperty('hasMoreProjects');
  });
});
