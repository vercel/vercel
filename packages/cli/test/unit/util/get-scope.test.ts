import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useTeam, createTeam } from '../../mocks/team';
import getScope from '../../../src/util/get-scope';
import * as linkModule from '../../../src/util/projects/link';

vi.mock('../../../src/util/projects/link');
const mockedGetProjectLink = vi.mocked(linkModule.getProjectLink);

describe('getScope', () => {
  let mockTeam: ReturnType<typeof useTeam>;
  let mockUser: ReturnType<typeof useUser>;
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeam = useTeam();
    // Default: no linked project
    mockedGetProjectLink.mockResolvedValue(null);
  });

  describe('non-northstar', () => {
    beforeEach(() => {
      mockUser = useUser();
    });

    it('should return user if team is unspecified', async () => {
      const { contextName, team, user } = await getScope(client);
      await expect(user.id).toEqual(mockUser.id);
      await expect(team).toBeNull();
      await expect(contextName).toEqual(mockUser.username);
    });

    it('should return team if team is specified', async () => {
      client.config.currentTeam = mockTeam.id;
      const { contextName, team, user } = await getScope(client);
      await expect(user.id).toEqual(mockUser.id);
      await expect(team?.id).toEqual(mockTeam.id);
      await expect(contextName).toEqual(mockTeam.slug);
    });

    it('should not return team if team is specified but getTeam is false', async () => {
      client.config.currentTeam = mockTeam.id;
      const { contextName, team, user } = await getScope(client, {
        getTeam: false,
      });
      await expect(user.id).toEqual(mockUser.id);
      await expect(team).toBeNull();
      await expect(contextName).toEqual(mockUser.username);
    });
  });

  describe('northstar', () => {
    beforeEach(() => {
      mockUser = useUser({
        version: 'northstar',
        defaultTeamId: mockTeam.id,
      });
    });

    it('should return default team', async () => {
      const { contextName, team, user } = await getScope(client);
      await expect(user.id).toEqual(mockUser.id);
      await expect(team?.id).toEqual(mockTeam.id);
      await expect(contextName).toEqual(mockTeam.slug);
    });

    it('should not return default team if getTeam is false', async () => {
      const { contextName, team, user } = await getScope(client, {
        getTeam: false,
      });
      await expect(user.id).toEqual(mockUser.id);
      await expect(team).toBeNull();
      await expect(contextName).toEqual(mockUser.username);
    });
  });

  describe('linked project', () => {
    let linkedTeam: ReturnType<typeof createTeam>;

    beforeEach(() => {
      mockUser = useUser({
        version: 'northstar',
        defaultTeamId: mockTeam.id,
      });
      // Create a different team for the linked project (use createTeam to add to existing teams)
      linkedTeam = createTeam(`team_linked_${Date.now()}`);
      // Register route for the linked team
      client.scenario.get(`/teams/${linkedTeam.id}`, (_req, res) => {
        res.json(linkedTeam);
      });
    });

    it('should use linked project orgId over currentTeam', async () => {
      // Set currentTeam to mockTeam
      client.config.currentTeam = mockTeam.id;

      // But linked project points to linkedTeam
      mockedGetProjectLink.mockResolvedValue({
        orgId: linkedTeam.id,
        projectId: 'prj_test',
      });

      const { contextName, team, user } = await getScope(client);
      await expect(user.id).toEqual(mockUser.id);
      // Should use linkedTeam, not mockTeam
      await expect(team?.id).toEqual(linkedTeam.id);
      await expect(contextName).toEqual(linkedTeam.slug);
    });

    it('should use linked project orgId over defaultTeamId', async () => {
      // No currentTeam set, defaultTeamId is mockTeam
      // Linked project points to linkedTeam
      mockedGetProjectLink.mockResolvedValue({
        orgId: linkedTeam.id,
        projectId: 'prj_test',
      });

      const { contextName, team, user } = await getScope(client);
      await expect(user.id).toEqual(mockUser.id);
      // Should use linkedTeam, not defaultTeamId (mockTeam)
      await expect(team?.id).toEqual(linkedTeam.id);
      await expect(contextName).toEqual(linkedTeam.slug);
    });

    it('should fall back to currentTeam if linked project has no team orgId', async () => {
      client.config.currentTeam = mockTeam.id;

      // Linked project with user orgId (not a team)
      mockedGetProjectLink.mockResolvedValue({
        orgId: 'user_123', // Not a team_ prefix
        projectId: 'prj_test',
      });

      const { contextName, team, user } = await getScope(client);
      await expect(user.id).toEqual(mockUser.id);
      // Should fall back to currentTeam
      await expect(team?.id).toEqual(mockTeam.id);
      await expect(contextName).toEqual(mockTeam.slug);
    });

    it('should fall back to defaultTeamId if no linked project and no currentTeam', async () => {
      // No linked project
      mockedGetProjectLink.mockResolvedValue(null);

      const { contextName, team, user } = await getScope(client);
      await expect(user.id).toEqual(mockUser.id);
      // Should use defaultTeamId (mockTeam)
      await expect(team?.id).toEqual(mockTeam.id);
      await expect(contextName).toEqual(mockTeam.slug);
    });
  });
});
