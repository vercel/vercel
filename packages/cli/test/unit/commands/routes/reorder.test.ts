import { describe, it, expect, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useStageRoutes } from '../../../mocks/routes';
import { shellQuoteRouteIdentifierForSuggestion } from '../../../../src/commands/routes/shared';
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

  it('suggested reorder command keeps single quotes around spaced route names', () => {
    expect(shellQuoteRouteIdentifierForSuggestion('route-id')).toBe('route-id');
    expect(shellQuoteRouteIdentifierForSuggestion('Rewrite /abc to root')).toBe(
      "'Rewrite /abc to root'"
    );
    expect(shellQuoteRouteIdentifierForSuggestion('API Rewrite')).toBe(
      "'API Rewrite'"
    );
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
    client.setArgv('routes', 'reorder', 'Route 4', '--position', '2', '--yes');
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
    client.setArgv('routes', 'reorder', 'Route 1', '--position', '1', '--yes');
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
    client.setArgv('routes', 'reorder', 'nonexistent', '--first', '--yes');
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

  it('should error when only one route exists', async () => {
    const { useStageRoutesWithSingleRoute } = await import(
      '../../../mocks/routes'
    );
    useStageRoutesWithSingleRoute();
    client.setArgv('routes', 'reorder', 'Only Route', '--first', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('only one route');
  });

  it('should error when reference route not found for after:', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      'after:nonexistent-id',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('not found');
  });

  it('should error when reference route not found for before:', async () => {
    useStageRoutes();
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      'before:nonexistent-id',
      '--yes'
    );
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('not found');
  });

  it('should verify PUT body has routes in correct order when moving to first', async () => {
    useStageRoutes();
    client.setArgv('routes', 'reorder', 'Route 3', '--first', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    const { capturedBodies } = await import('../../../mocks/routes');
    const body = capturedBodies.stage as any;
    expect(body.overwrite).toBe(true);
    // Route 3 (originally index 2) should now be first
    expect(body.routes[0].name).toBe('Route 3');
    expect(body.routes[1].name).toBe('Route 1');
  });

  it('should error on position 0', async () => {
    useStageRoutes();
    client.setArgv('routes', 'reorder', 'Route 1', '--position', '0', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('must be 1 or greater');
  });

  it('non-interactive: position 0 outputs JSON invalid_arguments with next commands', async () => {
    useStageRoutes();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    client.nonInteractive = true;
    client.setArgv(
      'routes',
      'reorder',
      'Route 1',
      '--position',
      '0',
      '--yes',
      '--non-interactive'
    );
    await routes(client);
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.status).toBe('error');
    expect(payload.reason).toBe('invalid_arguments');
    expect(payload.message).toContain('1 or greater');
    expect(payload.message).toContain('1-based');
    expect(payload.next?.length).toBeGreaterThanOrEqual(1);
    expect(
      payload.next.some(
        (n: { command: string }) =>
          n.command.includes('--first') || n.command.includes('--position 1')
      )
    ).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
    exitSpy.mockRestore();
    client.nonInteractive = false;
  });
});
