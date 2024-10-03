import { describe, it, expect } from 'vitest';
import teams from '../../../../src/commands/teams';
import { client } from '../../../mocks/client';

describe('teams', () => {
  it('errors when invoked without subcommand', async () => {
    client.setArgv('teams');
    const exitCodePromise = teams(client);
    expect(exitCodePromise).resolves.toBe(2);
  });
});
