import ms from 'ms';
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

  it(
    'should handle pulling',
    async () => {
      const cwd = setupFixture('now-dev-next');
      useUser();
      useTeams();
      useProject({
        ...defaultProject,
        id: 'now-dev-next',
        name: 'now-dev-next',
      });
      client.setArgv('pull', '--yes', cwd);
      const exitCode = await pull(client);
      expect(exitCode).toEqual(0);
    },
    ms('10s')
  );
});
