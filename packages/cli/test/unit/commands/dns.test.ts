import { describe, expect, it } from 'vitest';
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
});
