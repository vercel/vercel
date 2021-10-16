import pull from '../../src/commands/pull';
import { cleanupFixtures, setupFixture } from '../helpers/setupFixture';
import { client } from '../mocks/client';
import { defaultProject, useProject } from '../mocks/project';
import { useTeams } from '../mocks/team';
import { useUser } from '../mocks/user';
import fs from 'fs-extra';
import path from 'path';

describe('pull', () => {
  afterAll(() => {
    cleanupFixtures();
  });
  it('should handle pulling', async () => {
    const cwd = setupFixture('now-pull-next');
    useUser();
    useTeams();
    useProject({
      ...defaultProject,
      id: 'now-pull-next',
      name: 'now-pull-next',
    });
    client.setArgv('pull', '--yes', cwd);
    const exitCode = await pull(client);
    expect(exitCode).toEqual(0);
  });

  it('should handle custom --env flag', async () => {
    const cwd = setupFixture('now-pull-next');
    useUser();
    useTeams();
    useProject({
      ...defaultProject,
      id: 'now-pull-next',
      name: 'now-pull-next',
    });
    const expectedEnvFilename = '.env.vercel';
    client.setArgv('pull', '--yes', `--env=${expectedEnvFilename}`, cwd);

    const exitCode = await pull(client);
    const actualEnv = await fs.pathExists(path.join(cwd, expectedEnvFilename));
    const raw = await fs.readFile(path.join(cwd, expectedEnvFilename));

    expect(exitCode).toEqual(0);
    expect(actualEnv).toBeTruthy();
    expect(raw.includes('# Created by Vercel CLI')).toBeTruthy();
  });
});
