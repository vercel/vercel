import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useDeleteRoute } from '../../../mocks/routes';
import routes from '../../../../src/commands/routes';

describe('routes remove', () => {
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
    client.setArgv('routes', 'remove', '--help');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
  });

  it('should remove a route by name', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'remove', 'Route A', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Removed');
  });

  it('should remove a route by ID', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'remove', 'route-b-id', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Removed');
  });

  it('should remove multiple routes', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'remove', 'Route A', 'Route B', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Removed');
  });

  it('should error when no args provided', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'remove');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(2);
  });

  it('should error when route not found', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'remove', 'nonexistent', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No route found');
  });

  it('should show what will be removed', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'remove', 'Route A', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Route A');
  });

  it('should work with rm alias', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'rm', 'Route A', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Removed');
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
  });

  it('warns that delete is deprecated', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'delete', 'Route A', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      '`vercel routes delete` is deprecated. Use `vercel routes remove`.'
    );
  });

  it('should verify delete body contains correct route IDs', async () => {
    useDeleteRoute();
    client.setArgv('routes', 'remove', 'Route A', 'Route B', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    const { capturedBodies } = await import('../../../mocks/routes');
    const body = capturedBodies.delete as any;
    expect(body.routeIds).toContain('route-a-id');
    expect(body.routeIds).toContain('route-b-id');
    expect(body.routeIds).toHaveLength(2);
  });
});
