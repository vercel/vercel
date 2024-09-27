import { describe, it, expect } from 'vitest';
import git from '../../../../src/commands/git';
import { client } from '../../../mocks/client';

// this requires mocking a linked project
describe.todo('git', () => {
  it('errors when invoked without subcommand', async () => {
    client.setArgv('git');
    const exitCodePromise = git(client);
    expect(exitCodePromise).resolves.toBe(2);
  });
});
