import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useRoutes } from '../../../mocks/routes';
import routes from '../../../../src/commands/routes';

describe('routes export', () => {
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
    client.setArgv('routes', 'export', '--help');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(2);
  });

  it('should export routes as vercel.json format by default', async () => {
    useRoutes(3);
    client.setArgv('routes', 'export');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    const output = client.stdout.getFullOutput();
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('routes');
    expect(Array.isArray(parsed.routes)).toBe(true);
    expect(parsed.routes.length).toBeGreaterThan(0);
    expect(parsed.routes[0]).toHaveProperty('src');
  });

  it('should export routes as vercel.ts format', async () => {
    useRoutes(3);
    client.setArgv('routes', 'export', '--format', 'ts');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    const output = client.stdout.getFullOutput();
    expect(output).toContain(
      "import { defineConfig } from '@vercel/sdk/config'"
    );
    expect(output).toContain('export default defineConfig');
    expect(output).toContain('routes:');
  });

  it('should error on invalid format', async () => {
    useRoutes(3);
    client.setArgv('routes', 'export', '--format', 'xml');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid format');
  });

  it('should export a specific route by name', async () => {
    useRoutes(3);
    client.setArgv('routes', 'export', 'Route 1');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    const output = client.stdout.getFullOutput();
    const parsed = JSON.parse(output);
    // Route 1 is enabled, so it should be in the output
    expect(parsed.routes).toHaveLength(1);
  });

  it('should error when route not found', async () => {
    useRoutes(3);
    client.setArgv('routes', 'export', 'nonexistent');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No route found');
  });

  it('should handle empty project gracefully', async () => {
    useRoutes(0);
    client.setArgv('routes', 'export');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No routes found');
  });

  it('should exclude disabled routes in json format', async () => {
    useRoutes(4); // Route 0 has enabled: false (index % 3 === 0)
    client.setArgv('routes', 'export');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    const output = client.stdout.getFullOutput();
    const parsed = JSON.parse(output);
    // Route 0 and Route 3 are disabled (index % 3 === 0), so only 2 enabled routes
    expect(parsed.routes.length).toBeLessThan(4);
  });
});
