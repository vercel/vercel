import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import microfrontends from '../../../../src/commands/microfrontends';
import * as linkModule from '../../../../src/util/projects/link';
import { teamCache } from '../../../../src/util/teams/get-team-by-id';
import type { MicrofrontendsGroupsResponse } from '../../../../src/commands/microfrontends/types';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

const defaultGroupsResponse: MicrofrontendsGroupsResponse = {
  groups: [
    {
      group: {
        id: 'group_1',
        slug: 'my-group',
        name: 'My Group',
      },
      projects: [{ id: 'proj_existing' }],
    },
  ],
  maxMicrofrontendsGroupsPerTeam: 10,
  maxMicrofrontendsPerGroup: 20,
};

interface MockOptions {
  groupsResponse?: MicrofrontendsGroupsResponse;
  patchHandler?: (req: any, res: any) => void;
  billingPlan?: string;
}

function setupMocks(options: MockOptions = {}) {
  const {
    groupsResponse = defaultGroupsResponse,
    patchHandler,
    billingPlan = 'pro',
  } = options;

  let patchBody: any;
  let patchCalled = false;

  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'proj_new',
      name: 'new-project',
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

  if (patchHandler) {
    client.scenario.patch(
      '/v10/projects/:projectId/microfrontends',
      patchHandler
    );
  } else {
    client.scenario.patch(
      '/v10/projects/:projectId/microfrontends',
      (req, res) => {
        patchCalled = true;
        patchBody = req.body;
        res.json({});
      }
    );
  }

  return {
    getPatchBody: () => patchBody,
    getPatchCalled: () => patchCalled,
  };
}

describe('microfrontends add-to-group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    teamCache.clear();
  });

  describe('--help', () => {
    it('prints usage', async () => {
      client.setArgv('microfrontends', 'add-to-group', '--help');
      const exitCode = await microfrontends(client);
      expect(exitCode).toBe(2);
    });
  });

  describe('with flags', () => {
    it('adds to group with flags and confirms interactively', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'add-to-group',
        '--group=My Group',
        '--default-route=/docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Add "new-project" to "My Group"?');
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPatchCalled()).toBe(true);
      expect(mocks.getPatchBody()).toEqual({
        microfrontendsGroupId: 'group_1',
        isDefaultApp: false,
        defaultRoute: '/docs',
        enabled: true,
      });
    });

    it('errors when group not found', async () => {
      setupMocks();
      client.setArgv('microfrontends', 'add-to-group', '--group=Nonexistent');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Microfrontends group "Nonexistent" not found.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('errors when default route does not start with /', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'add-to-group',
        '--group=My Group',
        '--default-route=docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Error: Route must start with /');
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('project already in a group', () => {
    it('errors with message that project cannot be in more than one group', async () => {
      setupMocks({
        groupsResponse: {
          groups: [
            {
              group: {
                id: 'group_1',
                slug: 'my-group',
                name: 'My Group',
              },
              projects: [{ id: 'proj_new' }],
            },
          ],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });
      client.setArgv('microfrontends', 'add-to-group', '--group=My Group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'A project cannot be in more than one microfrontends group.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('project limit exceeded', () => {
    it('errors when group is at max projects', async () => {
      setupMocks({
        groupsResponse: {
          groups: [
            {
              group: {
                id: 'group_1',
                slug: 'my-group',
                name: 'My Group',
              },
              projects: Array.from({ length: 20 }, (_, i) => ({
                id: `proj_${i}`,
              })),
            },
          ],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });

      client.setArgv('microfrontends', 'add-to-group', '--group=My Group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Group "My Group" has reached the maximum number of projects (20).'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('hobby plan enforcement', () => {
    it('blocks and redirects to upgrade when exceeding free tier', async () => {
      setupMocks({
        billingPlan: 'hobby',
        groupsResponse: {
          groups: [
            {
              group: { id: 'group_1', slug: 'my-group', name: 'My Group' },
              projects: [{ id: 'proj_a' }, { id: 'proj_b' }],
            },
          ],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });

      client.setArgv(
        'microfrontends',
        'add-to-group',
        '--group=My Group',
        '--default-route=/docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        "You've reached the microfrontends project limit for Hobby"
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('allows hobby users within the free tier', async () => {
      setupMocks({ billingPlan: 'hobby' });

      client.setArgv(
        'microfrontends',
        'add-to-group',
        '--group=My Group',
        '--default-route=/docs'
      );

      const exitCodePromise = microfrontends(client);

      // Within free tier (1 existing + 1 new = 2), so billing confirmation appears
      await expect(client.stderr).toOutput('Add "new-project" to "My Group"?');
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('permission denied', () => {
    it('shows friendly error on 403', async () => {
      setupMocks({
        patchHandler: (_req, res) => {
          res.status(403).json({ error: { code: 'forbidden' } });
        },
      });

      client.setArgv(
        'microfrontends',
        'add-to-group',
        '--group=My Group',
        '--default-route=/docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Add "new-project" to "My Group"?');
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
              group: { id: 'group_1', slug: 'my-group', name: 'My Group' },
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
      client.setArgv('microfrontends', 'add-to-group');
      (client.stdin as any).isTTY = false;

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: This command must be run interactively because it affects billing.'
      );
      expect(await exitCodePromise).toBe(1);
      (client.stdin as any).isTTY = true;
    });
  });

  describe('no groups exist', () => {
    it('errors when no groups exist', async () => {
      setupMocks({
        groupsResponse: {
          groups: [],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });

      client.setArgv('microfrontends', 'add-to-group', '--group=My Group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: No microfrontends groups exist.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('user aborts', () => {
    it('aborts when user declines confirmation', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'add-to-group',
        '--group=My Group',
        '--default-route=/docs'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Add "new-project" to "My Group"?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Aborted.');
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('interactive', () => {
    it('adds to group interactively', async () => {
      const mocks = setupMocks();
      client.setArgv('microfrontends', 'add-to-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput('Select a microfrontends group:');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Default route');
      client.stdin.write('/new-project\n');

      await expect(client.stderr).toOutput('Add "new-project" to "My Group"?');
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPatchCalled()).toBe(true);
      expect(mocks.getPatchBody().microfrontendsGroupId).toBe('group_1');
      expect(mocks.getPatchBody().defaultRoute).toBe('/new-project');
    });
  });
});
