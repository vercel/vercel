import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import microfrontends from '../../../../src/commands/microfrontends';
import * as linkModule from '../../../../src/util/projects/link';
import { teamCache } from '../../../../src/util/teams/get-team-by-id';
import type { MicrofrontendsGroupsResponse } from '../../../../src/commands/microfrontends/types';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

const defaultGroupsResponse: MicrofrontendsGroupsResponse = {
  groups: [],
  maxMicrofrontendsGroupsPerTeam: 10,
  maxMicrofrontendsPerGroup: 20,
};

const defaultProjects = [
  {
    id: 'proj_web',
    name: 'web',
    accountId: 'team_123',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    targets: {
      production: {
        alias: ['web-my-team.vercel.app'],
      },
    },
  },
  {
    id: 'proj_docs',
    name: 'docs',
    accountId: 'team_123',
    updatedAt: Date.now(),
    createdAt: Date.now(),
  },
  {
    id: 'proj_blog',
    name: 'blog',
    accountId: 'team_123',
    updatedAt: Date.now(),
    createdAt: Date.now(),
  },
  {
    id: 'proj_shop',
    name: 'shop',
    accountId: 'team_123',
    updatedAt: Date.now(),
    createdAt: Date.now(),
  },
  {
    id: 'proj_blog',
    name: 'blog',
    accountId: 'team_123',
    updatedAt: Date.now(),
    createdAt: Date.now(),
  },
];

interface MockOptions {
  groupsResponse?: MicrofrontendsGroupsResponse;
  postHandler?: (req: any, res: any) => void;
  billingPlan?: string;
}

function setupMocks(options: MockOptions = {}) {
  const {
    groupsResponse = defaultGroupsResponse,
    postHandler,
    billingPlan = 'pro',
  } = options;

  let postBody: any;
  let postCalled = false;

  client.config.currentTeam = 'team_123';

  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'proj_web',
      name: 'web',
      accountId: 'team_123',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: 'team_123', slug: 'my-team', type: 'team' },
  });

  client.scenario.get('/v2/user', (_req, res) => {
    res.json({ user: { id: 'user_123', username: 'testuser' } });
  });

  client.scenario.get('/teams/team_123', (_req, res) => {
    res.json({
      id: 'team_123',
      slug: 'my-team',
      name: 'My Team',
      billing: { plan: billingPlan, period: { start: 0, end: 0 }, addons: [] },
    });
  });

  client.scenario.get('/v1/microfrontends/groups', (_req, res) => {
    res.json(groupsResponse);
  });

  client.scenario.get('/v9/projects', (_req, res) => {
    res.json({
      projects: defaultProjects,
      pagination: { count: defaultProjects.length, next: null },
    });
  });

  for (const project of defaultProjects) {
    client.scenario.get(`/v9/projects/${project.name}`, (_req, res) => {
      res.json(project);
    });
    client.scenario.get(`/v9/projects/${project.id}`, (_req, res) => {
      res.json(project);
    });
  }

  if (postHandler) {
    client.scenario.post('/v1/microfrontends/group', postHandler);
  } else {
    client.scenario.post('/v1/microfrontends/group', (req, res) => {
      postCalled = true;
      postBody = req.body;
      res.json({ id: 'group_new', name: req.body.groupName });
    });
  }

  return {
    getPostBody: () => postBody,
    getPostCalled: () => postCalled,
  };
}

describe('microfrontends create-group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    teamCache.clear();
  });

  describe('--help', () => {
    it('prints usage', async () => {
      client.setArgv('microfrontends', 'create-group', '--help');
      const exitCode = await microfrontends(client);
      expect(exitCode).toBe(2);
    });
  });

  describe('with flags', () => {
    it('creates a group with flags and confirms interactively', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      // Prompts for route of non-default project
      await expect(client.stderr).toOutput('Default route for "docs":');
      client.stdin.write('/docs\n');

      await expect(client.stderr).toOutput('Create microfrontends group?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Create a microfrontends.json now?');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPostCalled()).toBe(true);
      expect(mocks.getPostBody()).toEqual({
        groupName: 'My Group',
        defaultApp: { projectId: 'proj_web', defaultRoute: '/' },
        otherApplications: [{ projectId: 'proj_docs', defaultRoute: '/docs' }],
      });
    });

    it('uses --default-route for the default app', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=My Group',
        '--project=web',
        '--default-app=web',
        '--default-route=/app'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Create microfrontends group?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Create a microfrontends.json now?');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPostBody().defaultApp.defaultRoute).toBe('/app');
    });

    it('errors when default-app is not in selected projects', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=My Group',
        '--project=web',
        '--default-app=blog'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Default app "blog" must be one of the selected projects.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when project not found', async () => {
      setupMocks();
      client.scenario.get('/v9/projects/nonexistent', (_req, res) => {
        res.status(404).json({ error: { code: 'not_found' } });
      });

      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=My Group',
        '--project=nonexistent',
        '--default-app=nonexistent'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Project "nonexistent" not found.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('group name validation', () => {
    it('errors when name is too long', async () => {
      setupMocks();
      const longName = 'a'.repeat(49);
      client.setArgv(
        'microfrontends',
        'create-group',
        `--name=${longName}`,
        '--project=web',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Group name must be 48 characters or less.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when name is duplicate', async () => {
      setupMocks({
        groupsResponse: {
          ...defaultGroupsResponse,
          groups: [
            {
              group: {
                id: 'group_1',
                slug: 'existing-group',
                name: 'Existing Group',
              },
              projects: [],
            },
          ],
        },
      });

      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=Existing Group',
        '--project=web',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: A group named "Existing Group" already exists.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('group limit exceeded', () => {
    it('errors when maximum groups reached', async () => {
      setupMocks({
        groupsResponse: {
          groups: Array.from({ length: 10 }, (_, i) => ({
            group: {
              id: `group_${i}`,
              slug: `group-${i}`,
              name: `Group ${i}`,
            },
            projects: [],
          })),
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });

      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=New Group',
        '--project=web',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Maximum number of microfrontends groups (10) reached.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('hobby plan enforcement', () => {
    it('blocks and redirects to upgrade when exceeding free tier', async () => {
      setupMocks({
        billingPlan: 'hobby',
        groupsResponse: {
          ...defaultGroupsResponse,
          groups: [
            {
              group: { id: 'group_1', slug: 'existing', name: 'Existing' },
              projects: [
                { id: 'proj_a', name: 'a' },
                { id: 'proj_b', name: 'b' },
              ],
            },
          ],
        },
      });

      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=New Group',
        '--project=web',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        "You've reached the microfrontends project limit for Hobby"
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('allows hobby users within the free tier', async () => {
      const mocks = setupMocks({ billingPlan: 'hobby' });

      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=My Group',
        '--project=web',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Create microfrontends group?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Create a microfrontends.json now?');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPostCalled()).toBe(true);
    });
  });

  describe('permission denied', () => {
    it('shows friendly error on 403', async () => {
      setupMocks({
        postHandler: (_req, res) => {
          res.status(403).json({ error: { code: 'forbidden' } });
        },
      });

      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=My Group',
        '--project=web',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Create microfrontends group?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Error: You must be an Owner to create or modify microfrontends groups.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('non-TTY', () => {
    it('errors requiring interactive mode when billing affected', async () => {
      setupMocks({
        groupsResponse: {
          groups: [
            {
              group: { id: 'group_1', slug: 'existing', name: 'Existing' },
              projects: [
                { id: 'proj_a', name: 'a' },
                { id: 'proj_b', name: 'b' },
              ],
            },
          ],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });
      client.setArgv('microfrontends', 'create-group');
      (client.stdin as any).isTTY = false;

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: This command must be run interactively because it affects billing.'
      );
      expect(await exitCodePromise).toBe(1);
      (client.stdin as any).isTTY = true;
    });
  });

  describe('non-interactive mode', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('errors when --name is missing', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--project=web',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Missing required flag --name. Use --name in non-interactive mode.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when --project is missing', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Missing required flag --project. Use --project in non-interactive mode.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when multiple projects are set without --default-app', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--project=docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Missing required flag --default-app when using multiple --project values in non-interactive mode.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('creates group without prompts when billing is not affected', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--yes',
        '--name=My Group',
        '--project=web',
        '--default-app=web'
      );

      const exitCode = await microfrontends(client);

      expect(exitCode).toBe(0);
      expect(mocks.getPostCalled()).toBe(true);
      expect(mocks.getPostBody()).toEqual({
        groupName: 'My Group',
        defaultApp: { projectId: 'proj_web', defaultRoute: '/' },
        otherApplications: [],
      });
    });

    it('errors in non-interactive mode when missing project default routes', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Missing required flag --project-default-route for "docs". Use --project-default-route=docs=/<path> in non-interactive mode.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors for invalid --project-default-route format', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web',
        '--project-default-route=docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Invalid --project-default-route value "docs". Use "<project>=<route>", for example "docs=/docs".'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when --project-default-route points to an unselected project', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web',
        '--project-default-route=shop=/shop'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Invalid --project-default-route value "shop=/shop". Project "shop" is not one of the selected projects.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when --project-default-route is provided for the default app', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web',
        '--project-default-route=web=/'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Invalid --project-default-route value "web=/". Use --default-route for the default app "web".'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors for invalid route value in --project-default-route', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web',
        '--project-default-route=docs=docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Invalid --project-default-route value "docs=docs": Route must start with /'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('creates group in non-interactive mode with multiple projects and project default routes', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--yes',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web',
        '--project-default-route=docs=/docs'
      );

      const exitCode = await microfrontends(client);

      expect(exitCode).toBe(0);
      expect(mocks.getPostCalled()).toBe(true);
      expect(mocks.getPostBody()).toEqual({
        groupName: 'My Group',
        defaultApp: { projectId: 'proj_web', defaultRoute: '/' },
        otherApplications: [{ projectId: 'proj_docs', defaultRoute: '/docs' }],
      });
    });

    it('accepts multiple --project-default-route values', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--project=blog',
        '--default-app=web',
        '--project-default-route=docs=/docs',
        '--project-default-route=blog=/blog'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Create microfrontends group?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Create a microfrontends.json now?');
      client.stdin.write('n\n');

      const exitCode = await exitCodePromise;

      expect(exitCode).toBe(0);
      expect(mocks.getPostCalled()).toBe(true);
      expect(mocks.getPostBody()).toEqual({
        groupName: 'My Group',
        defaultApp: { projectId: 'proj_web', defaultRoute: '/' },
        otherApplications: [
          { projectId: 'proj_docs', defaultRoute: '/docs' },
          { projectId: 'proj_blog', defaultRoute: '/blog' },
        ],
      });
    });

    it('errors on duplicate --project-default-route for the same project', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--project=docs',
        '--default-app=web',
        '--project-default-route=docs=/docs',
        '--project-default-route=docs=/docs-v2'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Duplicate --project-default-route for project "docs".'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when --yes is missing and stdin is not a TTY', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--default-app=web'
      );
      (client.stdin as any).isTTY = false;

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Confirmation required. Use --yes to confirm group creation in non-interactive mode.'
      );
      expect(await exitCodePromise).toBe(1);
      (client.stdin as any).isTTY = true;
    });

    it('errors in non-interactive mode when creation would affect billing', async () => {
      const mocks = setupMocks({
        groupsResponse: {
          ...defaultGroupsResponse,
          groups: [
            {
              group: { id: 'group_1', slug: 'existing', name: 'Existing' },
              projects: [
                { id: 'proj_a', name: 'a' },
                { id: 'proj_b', name: 'b' },
              ],
            },
          ],
        },
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.setArgv(
        'microfrontends',
        'create-group',
        '--non-interactive',
        '--name=My Group',
        '--project=web',
        '--default-app=web'
      );

      await expect(microfrontends(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'purchase_requires_user',
      });
      expect(mocks.getPostCalled()).toBe(false);
    });
  });

  describe('interactive', () => {
    it('creates a group interactively', async () => {
      const mocks = setupMocks();
      client.setArgv('microfrontends', 'create-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Group name:');
      client.stdin.write('My Interactive Group\n');

      await expect(client.stderr).toOutput('Select a project to add:');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Add another project?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Create microfrontends group?');
      client.stdin.write('y\n');

      // Default app matches linked project (web), so it prompts for microfrontends.json
      await expect(client.stderr).toOutput('Create a microfrontends.json now?');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPostCalled()).toBe(true);
      expect(mocks.getPostBody().groupName).toBe('My Interactive Group');
    });
  });
});
