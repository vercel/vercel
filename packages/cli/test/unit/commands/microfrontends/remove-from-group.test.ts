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
      projects: [
        {
          id: 'proj_default',
          name: 'default-app',
          microfrontends: { isDefaultApp: true, enabled: true },
        },
        {
          id: 'proj_child',
          name: 'child-project',
          microfrontends: { isDefaultApp: false, enabled: true },
        },
      ],
    },
  ],
  maxMicrofrontendsGroupsPerTeam: 10,
  maxMicrofrontendsPerGroup: 20,
};

interface MockOptions {
  groupsResponse?: MicrofrontendsGroupsResponse;
  patchHandler?: (req: any, res: any) => void;
  linkedProjectId?: string;
  linkedProjectName?: string;
}

function setupMocks(options: MockOptions = {}) {
  const {
    groupsResponse = defaultGroupsResponse,
    patchHandler,
    linkedProjectId = 'proj_child',
    linkedProjectName = 'child-project',
  } = options;

  let patchBody: any;
  let patchCalled = false;

  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: linkedProjectId,
      name: linkedProjectName,
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
      billing: { plan: 'pro', period: { start: 0, end: 0 }, addons: [] },
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

describe('microfrontends remove-from-group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    teamCache.clear();
  });

  describe('--help', () => {
    it('prints usage', async () => {
      client.setArgv('microfrontends', 'remove-from-group', '--help');
      const exitCode = await microfrontends(client);
      expect(exitCode).toBe(2);
    });
  });

  describe('with --yes flag', () => {
    it('removes project from group without confirmation', async () => {
      const mocks = setupMocks();
      client.setArgv('microfrontends', 'remove-from-group', '--yes');

      const exitCode = await microfrontends(client);

      expect(exitCode).toBe(0);
      expect(mocks.getPatchCalled()).toBe(true);
      expect(mocks.getPatchBody()).toEqual({ enabled: false });
    });
  });

  describe('project not in a group', () => {
    it('errors when project is not in any group', async () => {
      setupMocks({
        linkedProjectId: 'proj_unlinked',
        linkedProjectName: 'unlinked-project',
      });
      client.setArgv('microfrontends', 'remove-from-group', '--yes');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Project "unlinked-project" is not part of any microfrontends group.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('default app protection', () => {
    it('errors when trying to remove the default app', async () => {
      setupMocks({
        linkedProjectId: 'proj_default',
        linkedProjectName: 'default-app',
      });
      client.setArgv('microfrontends', 'remove-from-group', '--yes');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Project "default-app" is the default app for group "My Group" and cannot be removed.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('config warning', () => {
    it('warns when microfrontends.json still references the project', async () => {
      setupMocks({
        groupsResponse: {
          ...defaultGroupsResponse,
          groups: [
            {
              ...defaultGroupsResponse.groups[0],
              config: {
                applications: {
                  'default-app': { development: { fallback: 'example.com' } },
                  'child-project': {
                    routing: [{ paths: ['/child'] }],
                  },
                },
              },
            },
          ],
        },
      });
      client.setArgv('microfrontends', 'remove-from-group', '--yes');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'The microfrontends.json configuration still contains an entry for "child-project"'
      );
      await expect(client.stderr).toOutput(
        'Remember to remove "child-project" from your microfrontends.json configuration.'
      );
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
      client.setArgv('microfrontends', 'remove-from-group', '--yes');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: You must be an Owner to create or modify microfrontends groups.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('interactive', () => {
    it('confirms before removing', async () => {
      const mocks = setupMocks();
      client.setArgv('microfrontends', 'remove-from-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Remove "child-project" from "My Group"?'
      );
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPatchCalled()).toBe(true);
    });

    it('aborts when user declines', async () => {
      const mocks = setupMocks();
      client.setArgv('microfrontends', 'remove-from-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Remove "child-project" from "My Group"?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Aborted.');
      expect(await exitCodePromise).toBe(0);
      expect(mocks.getPatchCalled()).toBe(false);
    });
  });

  describe('non-TTY', () => {
    it('errors without --yes flag', async () => {
      setupMocks();
      client.setArgv('microfrontends', 'remove-from-group');
      (client.stdin as any).isTTY = false;

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Confirmation required. Use --yes to skip confirmation in non-interactive mode.'
      );
      expect(await exitCodePromise).toBe(1);
      (client.stdin as any).isTTY = true;
    });
  });
});
