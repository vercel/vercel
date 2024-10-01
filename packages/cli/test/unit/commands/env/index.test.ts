import { describe, it, expect } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';

describe('env', () => {
  it('errors when invoked without subcommand', async () => {
    client.setArgv('env');
    const exitCodePromise = env(client);
    expect(exitCodePromise).resolves.toBe(1);
  });
});
