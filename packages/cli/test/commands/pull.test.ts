import { client } from '../mocks/client';
import { useUser } from '../mocks/user';
import { useTeams } from '../mocks/team';
import { useProject } from '../mocks/project';
import pull from '../../src/commands/pull';

describe('pull', () => {
  it('should handle pulling', async () => {
    client.setArgv('pull', '--yes');
    useUser();
    useTeams();
    useProject();
    const exitCode = await pull(client);
    expect(exitCode).toEqual(0);
  });
});
