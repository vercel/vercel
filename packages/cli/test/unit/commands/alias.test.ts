import { client } from '../../mocks/client';
import alias from '../../../src/commands/alias';
import { useUser } from '../../mocks/user';
import { useAlias } from '../../mocks/alias';

describe('alias', () => {
  it('should list up to 20 aliases by default', async () => {
    useUser();
    useAlias();
    client.setArgv('alias', 'ls');
    const exitCodePromise = alias(client);
    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stdout).toOutput('dummy-19.app');
  });

  it('should list up to 2 aliases', async () => {
    useUser();
    useAlias();
    client.setArgv('alias', 'ls', '--limit', '2');
    const exitCodePromise = alias(client);
    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stdout).toOutput('dummy-1.app');
    await expect(true).toEqual(false);
  });
});
