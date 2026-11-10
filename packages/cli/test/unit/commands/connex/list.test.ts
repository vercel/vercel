import { describe, beforeEach, expect, it } from 'vitest';
import { join } from 'path';
import { mkdirp, writeJSON } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import connect from '../../../../src/commands/connex';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

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
      client.scenario.get('/v1/connect/connectors', (req, res) => {
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

      client.scenario.get('/v1/connect/connectors', (_req, res) => {
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
      client.scenario.get('/v1/connect/connectors', (req, res) => {
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
      client.scenario.get('/v1/connect/connectors', (req, res) => {
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
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
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
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
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

    it('should strip ansi from uid and name in table output', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_unsafe',
              uid: '\x1b[2Jslack/unsafe',
              name: 'Unsafe\x1b[1A Name',
              type: 'slack',
              typeName: 'Slack',
              createdAt: Date.now() - 60_000,
              includes: {
                projects: {
                  items: [],
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
      expect(stderr).toContain('slack/unsafe');
      expect(stderr).toContain('Unsafe Name');
      expect(stderr).not.toContain('\x1b[2J');
      expect(stderr).not.toContain('\x1b[1A');
    });

    it('should strip ansi from the type cell and project names', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
        res.json({
          clients: [
            {
              id: 'scl_unsafe',
              uid: 'slack/unsafe',
              name: 'Connector',
              type: 'slack',
              typeName: 'Sla\x1b[31mck',
              createdAt: Date.now() - 60_000,
              includes: {
                projects: {
                  items: [
                    {
                      projectId: 'proj_1',
                      project: { id: 'proj_1', name: 'evil\x1b[2Jproj' },
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
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Slack');
      expect(stderr).toContain('evilproj');
      expect(stderr).not.toContain('\x1b[31m');
      expect(stderr).not.toContain('\x1b[2J');
    });

    it('should render empty-state without project context', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
        res.json({ clients: [] });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('No connectors found');
    });

    it('should show friendly error when connect feature flag is off (404)', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found', message: 'Not Found' } });
      });

      client.setArgv('connect', 'list', '--all-projects');

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Connect is not enabled');
    });

    it('should output JSON with projects and hasMoreProjects when --format=json is used', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
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
      expect(parsed.connectors).toHaveLength(1);
      const [first] = parsed.connectors;
      expect(Object.keys(first)[0]).toBe('uid');
      expect(first.uid).toBe('oauth/my-client');
      expect(first.projects).toEqual([{ id: 'proj_1', name: 'web' }]);
      expect(first.hasMoreProjects).toBe(true);
    });

    it('should print --all-projects in next-page hint when the response has a cursor', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
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
      client.scenario.get('/v1/connect/connectors', (req, res) => {
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

  describe('filter flags (--type, --service, --search)', () => {
    it('should forward --type as a query param', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connect/connectors', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({ clients: [] });
      });

      client.setArgv('connect', 'list', '--all-projects', '--type', 'slack');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('type=slack');
    });

    it('should join multiple --type values as comma-separated', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connect/connectors', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({ clients: [] });
      });

      client.setArgv(
        'connect',
        'list',
        '--all-projects',
        '--type',
        'slack',
        '--type',
        'github'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('type=slack%2Cgithub');
    });

    it('should forward --service as a query param', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connect/connectors', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({ clients: [] });
      });

      client.setArgv(
        'connect',
        'list',
        '--all-projects',
        '--service',
        'mcp.linear.app'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('service=mcp.linear.app');
    });

    it('should forward --search as a query param', async () => {
      let requestUrl = '';
      client.scenario.get('/v1/connect/connectors', (req, res) => {
        requestUrl = req.url ?? '';
        res.json({ clients: [] });
      });

      client.setArgv('connect', 'list', '--all-projects', '--search', 'linear');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(requestUrl).toContain('search=linear');
    });

    it('should include active filter flags in the next-page hint', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
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
          cursor: 'cursor-xyz',
        });
      });

      client.setArgv(
        'connect',
        'list',
        '--all-projects',
        '--type',
        'slack',
        '--search',
        'linear'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('--type slack');
      expect(stderr).toContain('--query "linear"');
      expect(stderr).toContain('--next cursor-xyz');
    });
  });

  it('should output JSON for project-scoped list without projects field', async () => {
    const project = { ...defaultProject, id: 'proj_json_1', name: 'json-app' };
    useProject(project);
    await linkProjectInCwd(team, project);

    client.scenario.get('/v1/connect/connectors', (_req, res) => {
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
    expect(parsed.connectors).toHaveLength(1);
    const [first] = parsed.connectors;
    expect(first.uid).toBe('oauth/my-client');
    expect(first).not.toHaveProperty('projects');
    expect(first).not.toHaveProperty('hasMoreProjects');
  });

  it('should include branding fields in --format=json output', async () => {
    const project = { ...defaultProject, id: 'proj_brand', name: 'brand-app' };
    useProject(project);
    await linkProjectInCwd(team, project);

    client.scenario.get('/v1/connect/connectors', (_req, res) => {
      res.json({
        clients: [
          {
            id: 'scl_branded',
            uid: 'uid_branded',
            name: 'Branded',
            type: 'slack',
            typeName: 'Slack',
            createdAt: 1_700_000_000_000,
            icon: 'sha1abcdef',
            backgroundColor: '#1a2b3c',
            accentColor: '#ff0066',
          },
          {
            id: 'scl_plain',
            uid: 'uid_plain',
            name: 'Plain',
            type: 'slack',
            typeName: 'Slack',
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
    expect(parsed.connectors).toHaveLength(2);
    const [branded, plain] = parsed.connectors;
    expect(branded.icon).toBe('sha1abcdef');
    expect(branded.backgroundColor).toBe('#1a2b3c');
    expect(branded.accentColor).toBe('#ff0066');
    expect(plain.icon).toBeNull();
    expect(plain.backgroundColor).toBeNull();
    expect(plain.accentColor).toBeNull();
  });
  describe('pagination', () => {
    function usePagedConnectors() {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
        res.json({ clients: [], cursor: 'c_2' });
      });
    }

    it('adds pagination.next to the JSON and keeps cursor', async () => {
      usePagedConnectors();
      client.setArgv('connect', 'list', '--json');

      expect(await connect(client)).toBe(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.cursor).toBe('c_2');
      expect(json.pagination).toEqual({ next: 'c_2' });
    });

    it('returns a null pagination.next on the last page', async () => {
      client.scenario.get('/v1/connect/connectors', (_req, res) => {
        res.json({ clients: [] });
      });
      client.setArgv('connect', 'list', '--json');

      expect(await connect(client)).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput()).pagination).toEqual({
        next: null,
      });
    });
  });
});

describe('connex list --query', () => {
  // Runs `connect list` with a fresh client, recording the list request.
  async function run(...args: string[]) {
    client.reset();
    useUser({ id: 'user_1', username: 'tester' });
    const team = useTeam('team_test');
    client.config.currentTeam = team.id;
    client.cwd = setupTmpDir();
    let query: Record<string, unknown> | undefined;
    client.scenario.get('/v1/connect/connectors', (req, res) => {
      query = req.query;
      res.json({ clients: [] });
    });
    client.setArgv('connect', 'list', '--all-projects', ...args);
    const exitCode = await connect(client);
    return {
      exitCode,
      query,
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it('still accepts --search, with one warning that names --query', async () => {
    const now = await run('--query', 'linear');
    const before = await run('--search', 'linear');

    expect(now.exitCode).toBe(0);
    expect(now.query).toMatchObject({ search: 'linear' });
    expect(now.stderr).not.toContain('deprecated');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.query).toEqual(now.query);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain('! --search is deprecated. Use --query.\n');

    const nowJson = await run('--query', 'linear', '--json');
    const beforeJson = await run('--search', 'linear', '--json');
    expectDeprecationInJson(
      beforeJson.stdout,
      nowJson.stdout,
      '--search is deprecated. Use --query.'
    );
    expect(beforeJson.stderr).not.toContain('deprecated');
  });

  it('rejects --query with --search before any request', async () => {
    const result = await run('--query', 'a', '--search', 'b');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Can't use --query with --search.");
    expect(result.query).toBeUndefined();
  });
});
