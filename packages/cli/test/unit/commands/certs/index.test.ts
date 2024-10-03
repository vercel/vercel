import { describe, it, expect } from 'vitest';
import certs from '../../../../src/commands/certs';
import { client } from '../../../mocks/client';

describe('certs', () => {
  it('errors when invoked without subcommand', async () => {
    client.setArgv('certs');
    const exitCodePromise = certs(client);
    expect(exitCodePromise).resolves.toBe(2);
  });
});
