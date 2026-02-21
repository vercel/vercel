import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useEditRoute } from '../../../mocks/routes';
import routes from '../../../../src/commands/routes';

describe('routes enable', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'routes-test-project',
      name: 'routes-test',
    });
    const cwd = setupUnitFixture('commands/routes');
    client.cwd = cwd;
  });

  it('should show help with --help flag', async () => {
    client.setArgv('routes', 'enable', '--help');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(2);
  });

  it('should enable a disabled route', async () => {
    useEditRoute();
    client.setArgv('routes', 'enable', 'Disabled Route');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Enabled');
  });

  it('should report already enabled', async () => {
    useEditRoute();
    client.setArgv('routes', 'enable', 'Enabled Route');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('already enabled');
  });

  it('should error when no args provided', async () => {
    useEditRoute();
    client.setArgv('routes', 'enable');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
  });

  it('should error when route not found', async () => {
    useEditRoute();
    client.setArgv('routes', 'enable', 'nonexistent');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No route found');
  });
});
