import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useStageRoutes } from '../../../mocks/routes';
import routes from '../../../../src/commands/routes';

describe('routes reorder', () => {
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
    client.setArgv('routes', 'reorder', '--help');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(2);
  });

  it('should reorder to first position with --first', async () => {
    useStageRoutes();
    client.setArgv('routes', 'reorder', 'Route 3', '--first', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should reorder to last position with --last', async () => {
    useStageRoutes();
    client.setArgv('routes', 'reorder', 'Route 1', '--last', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should reorder with numeric --position', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 4',
      '--position',
      '2',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should reorder with --position start', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 3',
      '--position',
      'start',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should reorder with --position end', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      'end',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should say already at position if no change', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      '1',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('already at position');
  });

  it('should reorder with --position after:<id>', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      'after:route-3-id',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should reorder with --position before:<id>', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 4',
      '--position',
      'before:route-2-id',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should error on invalid position', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      'invalid',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid position');
  });

  it('should reorder with --position first alias', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 3',
      '--position',
      'first',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should reorder with --position last alias', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      'last',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });

  it('should error when no args provided', async () => {
    useStageRoutes();
    client.setArgv('routes', 'reorder');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
  });

  it('should error when route not found', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'nonexistent',
      '--first',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No route found');
  });

  it('should work with move alias', async () => {
    useStageRoutes();
    client.setArgv('routes', 'move', 'Route 3', '--first', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Moved');
  });
});
