import { client } from '../../../mocks/client';
import selectOrg from '../../../../src/util/input/select-org';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('selectOrg', () => {
  describe('non-northstar', () => {
    it('should allow selecting user', async () => {
      const user = useUser();
      useTeams();
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).toOutput(user.name);
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', user.id);
    });

    it('should allow selecting team', async () => {
      useUser();
      const team = useTeams()[0];
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).toOutput('Select the scope');
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
    });
  });

  describe('northstar', () => {
    it('should not allow selecting user', async () => {
      const user = useUser({
        version: 'northstar',
      });
      const team = useTeams()[0];
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).not.toOutput(user.name);
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
    });
  });
});
