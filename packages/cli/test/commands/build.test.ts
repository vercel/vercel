import { client } from '../mocks/client';
import build from '../../src/commands/build';
import frameworks from '../mocks/frameworks.json';
import { useUser } from '../mocks/user';
import { useTeams } from '../mocks/team';
import { defaultProject, useProject } from '../mocks/project';
import { cleanupFixtures, setupFixture } from '../helpers/setup-fixture';

describe('build', () => {
  afterAll(() => {
    cleanupFixtures();
  });
  it('works with next.js', async () => {
    const cwd = await setupFixture('vercel-pull-next');
    client.scenario.get('/v1/frameworks', (_req, res) => {
      res.json(frameworks);
    });
    client.setArgv('build', '--yes', cwd);
    useUser();
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    const exitCode = await build(client);
    expect(exitCode).toEqual(2);
  });
});
