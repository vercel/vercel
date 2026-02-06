import { beforeEach, describe, expect, it } from 'vitest';
import getScope from '../../../src/util/get-scope';
import { client } from '../../mocks/client';
import { useTeam } from '../../mocks/team';
import { useUser } from '../../mocks/user';

describe('getScope', () => {
  let mockTeam: ReturnType<typeof useTeam>;
  let mockUser: ReturnType<typeof useUser>;
  beforeEach(() => {
    mockTeam = useTeam();
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
