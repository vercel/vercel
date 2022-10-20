import { client } from '../../mocks/client';
import alias from '../../../src/commands/alias';
import { useUser } from '../../mocks/user';
import { useAlias } from '../../mocks/alias';

describe('alias', () => {
  it('should list aliases', async () => {
    useUser();
    useAlias();
    client.setArgv('alias', 'ls');
    const exitCodePromise = alias(client);
    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('dummy.app');
  });

  it('should throw an error if limit not valid', async () => {
    useUser();
    for (let limit of ['abc', '101']) {
      client.setArgv('alias', 'ls', '--limit', limit);
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(1);
    }
  });

  it('should throw an error if next not a number', async () => {
    useUser();
    client.setArgv('alias', 'ls', '--next', 'abc');
    const exitCodePromise = alias(client);
    await expect(exitCodePromise).resolves.toEqual(1);
  });
});
