import { client } from '../../mocks/client';
import dns from '../../../src/commands/dns';
import { useUser } from '../../mocks/user';
import { useDns } from '../../mocks/dns';

describe('dns', () => {
  it('should list up to 20 dns by default', async () => {
    useUser();
    useDns();
    client.setArgv('dns', 'ls');
    let exitCodePromise = dns(client);
    await expect(client.stderr).toOutput('example-19.com');
    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should list up to 2 dns if limit set to 2', async () => {
    useUser();
    useDns();
    client.setArgv('dns', 'ls', '--limit', 2);
    let exitCodePromise = dns(client);
    await expect(client.stderr).toOutput('example-2.com');
    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should throw an error if limit not valid', async () => {
    useUser();
    for (let limit of ['abc', '101']) {
      client.setArgv('dns', 'ls', '--limit', limit);
      let exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(1);
    }
  });

  it('should throw an error if next not a number', async () => {
    useUser();
    client.setArgv('dns', 'ls', '--next', 'abc');
    let exitCodePromise = dns(client);
    await expect(exitCodePromise).resolves.toEqual(1);
  });
});
