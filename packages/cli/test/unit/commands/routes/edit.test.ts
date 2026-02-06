import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useEditRoute } from '../../../mocks/routes';
import routes from '../../../../src/commands/routes';

describe('routes edit', () => {
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
    client.setArgv('routes', 'edit', '--help');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(2);
  });

  it('should error when no args provided', async () => {
    useEditRoute();
    client.setArgv('routes', 'edit');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
  });

  it('should error when route not found', async () => {
    useEditRoute();
    client.setArgv('routes', 'edit', 'nonexistent', '--name', 'New Name');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No route found');
  });

  describe('flag-based mode', () => {
    it('should change route name', async () => {
      useEditRoute();
      client.setArgv('routes', 'edit', 'Enabled Route', '--name', 'New Name');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should change route description', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--description',
        'New description'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should change destination', async () => {
      useEditRoute();
      client.setArgv('routes', 'edit', 'Enabled Route', '--dest', '/new-dest');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should switch to redirect with --action', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--action',
        'redirect',
        '--dest',
        '/new',
        '--status',
        '301'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should switch to set-status with --action', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--action',
        'set-status',
        '--status',
        '403'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should add a response header', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--set-response-header',
        'X-Custom=value'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should add a request header transform', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--set-request-header',
        'X-Forwarded=host'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should add a request query transform', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--set-request-query',
        'utm_source=cli'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should add a has condition', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--has',
        'header:Authorization'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should add a missing condition', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--missing',
        'cookie:session'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should clear conditions and add new ones', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--clear-conditions',
        '--has',
        'header:X-New'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should clear headers', async () => {
      useEditRoute();
      client.setArgv('routes', 'edit', 'Enabled Route', '--clear-headers');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should clear transforms', async () => {
      useEditRoute();
      client.setArgv('routes', 'edit', 'Enabled Route', '--clear-transforms');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });

    it('should error on invalid action type', async () => {
      useEditRoute();
      client.setArgv('routes', 'edit', 'Enabled Route', '--action', 'invalid');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid action type');
    });

    it('should error when --action redirect missing --status', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--action',
        'redirect',
        '--dest',
        '/new'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires --status');
    });

    it('should change source pattern and syntax', async () => {
      useEditRoute();
      client.setArgv(
        'routes',
        'edit',
        'Enabled Route',
        '--src',
        '/new-path',
        '--src-syntax',
        'equals'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');
    });
  });
});
