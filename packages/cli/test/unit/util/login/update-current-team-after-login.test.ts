import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { updateCurrentTeamAfterLogin } from '../../../../src/util/login/update-current-team-after-login';

describe('updateCurrentTeamAfterLogin', () => {
  describe('SSO Login', () => {
    it('should set currentTeam to SSO team ID', async () => {
      useUser();
      await updateCurrentTeamAfterLogin(client, client.output, 'ssoTeamId');
      await expect(client.config.currentTeam).toEqual('ssoTeamId');
    });
  });

  describe('northstar', () => {
    it('should set currentTeam to defaultTeamId', async () => {
      useUser({
        version: 'northstar',
        defaultTeamId: 'defaultTeamId',
      });
      await updateCurrentTeamAfterLogin(client, client.output);
      await expect(client.config.currentTeam).toEqual('defaultTeamId');
    });
  });

  describe('non-northstar', () => {
    it('should reset currentTeam', async () => {
      client.config.currentTeam = 'previousTeamId';
      useUser();
      await updateCurrentTeamAfterLogin(client, client.output);
      await expect(client.config.currentTeam).toBeUndefined();
    });
  });
});
