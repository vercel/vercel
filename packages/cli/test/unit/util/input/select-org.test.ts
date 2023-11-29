import { client } from '../../../mocks/client';
import selectOrg from '../../../../src/util/input/select-org';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('selectOrg', () => {
  let user;
  let team;

  beforeEach(() => {
    team = useTeams()[0];
  });

  describe('non-northstar', () => {
    beforeEach(() => {
      user = useUser();
    });

    it('should allow selecting user', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).toOutput(user.name);
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', user.id);
    });

    it('should allow selecting team', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).toOutput('Select the scope');
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
    });

    it('automatically selects the correct scope when autoconfirm flag is passed', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope', true);
      await expect(selectOrgPromise).resolves.toHaveProperty('id', user.id);
    });

    describe('with a selected team scope', () => {
      beforeEach(() => {
        client.config.currentTeam = team.id;
      });

      afterEach(() => {
        delete client.config.currentTeam;
      });

      it('should allow selecting user', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope');
        await expect(client.stderr).toOutput(user.name);
        client.stdin.write('\r'); // Return key
        await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
      });

      it('should allow selecting team', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope');
        await expect(client.stderr).toOutput('Select the scope');
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\r'); // Return key
        await expect(selectOrgPromise).resolves.toHaveProperty('id', user.id);
      });

      it('automatically selects the correct scope when autoconfirm flag is passed', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope', true);
        await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
      });
    });
  });

  describe('northstar', () => {
    beforeEach(() => {
      user = useUser({
        version: 'northstar',
      });
      client.config.currentTeam = team.id;
    });

    afterEach(() => {
      delete client.config.currentTeam;
    });

    it('should not allow selecting user', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).not.toOutput(user.name);
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
    });

    it('automatically selects the correct scope when autoconfirm flag is passed', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope', true);
      await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
    });
  });
});
