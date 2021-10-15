import pull from '../../src/commands/pull';
import { cleanupFixtures, setupFixture } from '../helpers/setupFixture';
import { client } from '../mocks/client';
import { defaultProject, useProject } from '../mocks/project';
import { useTeams } from '../mocks/team';
import { useUser } from '../mocks/user';

describe('pull', () => {
  afterAll(() => {
    cleanupFixtures();
  });

  it('should handle pulling', async () => {
    console.log('before');
    const cwd = setupFixture('now-dev-next');
    console.log({ cwd });
    useUser();
    useTeams();
    const proj = useProject({
      ...defaultProject,
      id: 'now-dev-next',
      name: 'now-dev-next',
    });
    console.log(proj);
    client.setArgv('pull', '--yes', cwd);
    const exitCode = await pull(client);
    expect(exitCode).toEqual(0);
  });
});
