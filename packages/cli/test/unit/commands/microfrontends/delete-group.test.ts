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
          id: 'proj_web',
          name: 'web',
          microfrontends: { isDefaultApp: true, enabled: true },
        },
        {
          id: 'proj_docs',
          name: 'docs',
          microfrontends: { isDefaultApp: false, enabled: true },
        },
      ],
    },
    {
      group: {
        id: 'group_2',
        slug: 'other-group',
        name: 'Other Group',
      },
      projects: [
        {
          id: 'proj_blog',
          name: 'blog',
          microfrontends: { isDefaultApp: true, enabled: true },
        },
      ],
    },
  ],
  maxMicrofrontendsGroupsPerTeam: 10,
  maxMicrofrontendsPerGroup: 20,
};

interface MockOptions {
  groupsResponse?: MicrofrontendsGroupsResponse;
  deleteHandler?: (req: any, res: any) => void;
}

function setupMocks(options: MockOptions = {}) {
  const { groupsResponse = defaultGroupsResponse, deleteHandler } = options;

  let deleteCalled = false;
  let deleteGroupId: string | undefined;

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
      billing: { plan: 'pro', period: { start: 0, end: 0 }, addons: [] },
    });
  });

  client.scenario.get('/v1/microfrontends/groups', (_req, res) => {
    res.json(groupsResponse);
  });

  if (deleteHandler) {
    client.scenario.delete(
      '/v2/teams/:teamId/microfrontends/:groupId',
      deleteHandler
    );
  } else {
    client.scenario.delete(
      '/v2/teams/:teamId/microfrontends/:groupId',
      (req, res) => {
        deleteCalled = true;
        deleteGroupId = req.params.groupId;
        res.json({});
      }
    );
  }

  return {
    getDeleteCalled: () => deleteCalled,
    getDeleteGroupId: () => deleteGroupId,
  };
}

describe('microfrontends delete-group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    teamCache.clear();
  });

  describe('--help', () => {
    it('prints usage', async () => {
      client.setArgv('microfrontends', 'delete-group', '--help');
      const exitCode = await microfrontends(client);
      expect(exitCode).toBe(2);
    });
  });

  describe('with --yes flag', () => {
    it('deletes a group without confirmation', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'delete-group',
        '--group=My Group',
        '--yes'
      );

      const exitCode = await microfrontends(client);

      expect(exitCode).toBe(0);
      expect(mocks.getDeleteCalled()).toBe(true);
      expect(mocks.getDeleteGroupId()).toBe('group_1');
    });

    it('finds group by ID', async () => {
      const mocks = setupMocks();
      client.setArgv(
        'microfrontends',
        'delete-group',
        '--group=group_2',
        '--yes'
      );

      const exitCode = await microfrontends(client);

      expect(exitCode).toBe(0);
      expect(mocks.getDeleteCalled()).toBe(true);
      expect(mocks.getDeleteGroupId()).toBe('group_2');
    });

    it('errors when group not found', async () => {
      setupMocks();
      client.setArgv(
        'microfrontends',
        'delete-group',
        '--group=Nonexistent',
        '--yes'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Microfrontends group "Nonexistent" not found.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('no groups exist', () => {
    it('errors when there are no groups', async () => {
      setupMocks({
        groupsResponse: {
          groups: [],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });
      client.setArgv(
        'microfrontends',
        'delete-group',
        '--group=My Group',
        '--yes'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: No microfrontends groups exist.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('permission denied', () => {
    it('shows friendly error on 403', async () => {
      setupMocks({
        deleteHandler: (_req, res) => {
          res.status(403).json({ error: { code: 'forbidden' } });
        },
      });
      client.setArgv(
        'microfrontends',
        'delete-group',
        '--group=My Group',
        '--yes'
      );

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: You must be an Owner to create or modify microfrontends groups.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('linked project suggestion', () => {
    it('suggests the linked project group when it is the default app', async () => {
      const mocks = setupMocks();
      client.setArgv('microfrontends', 'delete-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Delete microfrontends group "My Group"'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('This action is not reversible.');

      await expect(client.stderr).toOutput('to confirm deletion:');
      client.stdin.write('My Group\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getDeleteCalled()).toBe(true);
      expect(mocks.getDeleteGroupId()).toBe('group_1');
    });

    it('falls back to group selection when user declines suggested group', async () => {
      const mocks = setupMocks();
      client.setArgv('microfrontends', 'delete-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Delete microfrontends group "My Group"'
      );
      client.stdin.write('n\n');

      // Should show remaining groups (excluding the suggested one)
      await expect(client.stderr).toOutput(
        'Select a microfrontends group to delete:'
      );
      client.stdin.write('\n'); // select Other Group

      await expect(client.stderr).toOutput('to confirm deletion:');
      client.stdin.write('Other Group\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getDeleteCalled()).toBe(true);
      expect(mocks.getDeleteGroupId()).toBe('group_2');
    });

    it('aborts when user declines and only one group exists', async () => {
      setupMocks({
        groupsResponse: {
          groups: [defaultGroupsResponse.groups[0]],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });
      client.setArgv('microfrontends', 'delete-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Delete microfrontends group "My Group"'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Aborted.');
      expect(await exitCodePromise).toBe(0);
    });

    it('shows regular select when linked project is not a default app', async () => {
      const mocks = setupMocks({
        groupsResponse: {
          groups: [
            {
              group: { id: 'group_1', slug: 'my-group', name: 'My Group' },
              projects: [
                {
                  id: 'proj_web',
                  name: 'web',
                  microfrontends: { isDefaultApp: false, enabled: true },
                },
              ],
            },
            defaultGroupsResponse.groups[1],
          ],
          maxMicrofrontendsGroupsPerTeam: 10,
          maxMicrofrontendsPerGroup: 20,
        },
      });
      client.setArgv('microfrontends', 'delete-group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Select a microfrontends group to delete:'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('to confirm deletion:');
      client.stdin.write('My Group\n');

      expect(await exitCodePromise).toBe(0);
      expect(mocks.getDeleteCalled()).toBe(true);
    });
  });

  describe('interactive', () => {
    it('shows project count in warning', async () => {
      setupMocks();
      client.setArgv('microfrontends', 'delete-group', '--group=My Group');

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        '2 projects will be removed from the group.'
      );

      await expect(client.stderr).toOutput('to confirm deletion:');
      client.stdin.write('My Group\n');

      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('non-TTY', () => {
    it('errors without --group flag', async () => {
      setupMocks();
      client.setArgv('microfrontends', 'delete-group');
      (client.stdin as any).isTTY = false;

      const exitCodePromise = microfrontends(client);

      await expect(client.stderr).toOutput(
        'Error: Missing required flag --group.'
      );
      expect(await exitCodePromise).toBe(1);
      (client.stdin as any).isTTY = true;
    });

    it('errors without --yes flag', async () => {
      setupMocks();
      client.setArgv('microfrontends', 'delete-group', '--group=My Group');
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
