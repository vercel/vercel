import { describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import domains from '../../../src/commands/domains';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import { useDomain, useDomains } from '../../mocks/domains';

describe('domains', () => {
  it('should list up to 20 domains by default', async () => {
    useUser();
    useDomains();
    client.setArgv('domains', 'ls');
    let exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('example-19.com');
    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should list up to 2 domains if limit set to 2', async () => {
    useUser();
    useDomains();
    client.setArgv('domains', 'ls', '--limit', '2');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('example-1.com');
    await expect(exitCodePromise).resolves.toEqual(0);
  });

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
