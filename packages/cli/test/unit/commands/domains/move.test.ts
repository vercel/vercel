import { describe, expect, it } from 'vitest';

import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { useDomain } from '../../../mocks/domains';

describe('domains mv', () => {
  describe('[name]', () => {
    describe('[destination]', () => {
      describe.todo('--yes');

      describe('northstar', () => {
        it('should prevent moving a domain to a user account', async () => {
          const { username } = useUser({ version: 'northstar' });
          useTeams();
          useDomain('northstar');
          client.setArgv('domains', 'move', 'example-northstar.com', username);
          const exitCodePromise = domains(client);
          await expect(client.stderr).toOutput(
            `Fetching domain example-northstar.com under ${username}
Error: You may not move your domain to your user account.`
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });
      });
    });
  });
});
