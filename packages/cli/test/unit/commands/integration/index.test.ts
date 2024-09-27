import { describe, it, expect } from 'vitest';
import integration from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';

describe('integration', () => {
  it('errors when invoked without subcommand', async () => {
    client.setArgv('integration');
    const exitCodePromise = integration(client);
    expect(exitCodePromise).resolves.toBe(2);
  });
});
