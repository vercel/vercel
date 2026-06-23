import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { updateCurrentTeamAfterLogin } from '../../../../src/util/login/update-current-team-after-login';

describe('updateCurrentTeamAfterLogin', () => {
  describe('SSO Login', () => {
    it('should set currentTeam to SSO team ID', async () => {
      useUser();
      client.config.explicitCurrentTeam = 'previousTeamId';
      await updateCurrentTeamAfterLogin(client, 'ssoTeamId');
      await expect(client.config.currentTeam).toEqual('ssoTeamId');
      expect(client.config.explicitCurrentTeam).toBeUndefined();
    });
  });

  describe('northstar', () => {
    it('should set currentTeam to defaultTeamId', async () => {
      useUser({
        version: 'northstar',
        defaultTeamId: 'defaultTeamId',
      });
      client.config.explicitCurrentTeam = 'previousTeamId';
      await updateCurrentTeamAfterLogin(client);
      await expect(client.config.currentTeam).toEqual('defaultTeamId');
      expect(client.config.explicitCurrentTeam).toBeUndefined();
    });
  });

  describe('non-northstar', () => {
    it('should reset currentTeam', async () => {
      client.config.currentTeam = 'previousTeamId';
      client.config.explicitCurrentTeam = 'previousTeamId';
      useUser();
      await updateCurrentTeamAfterLogin(client);
      await expect(client.config.currentTeam).toBeUndefined();
      expect(client.config.explicitCurrentTeam).toBeUndefined();
    });
  });
});
