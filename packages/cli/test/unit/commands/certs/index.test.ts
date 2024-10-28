import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import certs from '../../../../src/commands/certs';

describe('certs', () => {
  it('errors when invoked without subcommand', async () => {
    client.setArgv('certs');
    const exitCodePromise = certs(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });
});
