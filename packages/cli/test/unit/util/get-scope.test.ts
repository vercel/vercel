import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import getScope from '../../../src/util/get-scope';

describe('getScope', () => {
  let mockTeam: ReturnType<typeof useTeams>[0];
  let mockUser: ReturnType<typeof useUser>;
  beforeEach(() => {
    mockTeam = useTeams()[0];
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
});
