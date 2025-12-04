import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('redirects remove', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: 'redirects-test',
      name: 'redirects-test',
    });
    client.scenario.get('/v9/projects/:projectNameOrId', (_req, res) => {
      res.json(project);
    });
    const cwd = setupUnitFixture('commands/redirects');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'redirects';
      const subcommand = 'remove';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = redirects(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('remove redirect', () => {
    it('should remove a redirect', async () => {
      mockGetVersions();
      mockGetRedirects();
      mockDeleteRedirects();
      mockPromoteVersion();

      client.setArgv('redirects', 'remove', '/old-path');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Fetching redirect information');
      await expect(client.stderr).toOutput('Removing redirect:');
      await expect(client.stderr).toOutput('/old-path → /new-path');
      await expect(client.stderr).toOutput('Remove this redirect?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Removing redirect for /old-path');
      await expect(client.stderr).toOutput('Redirect removed');
      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('y\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should skip confirmation with --yes flag', async () => {
      mockGetVersions();
      mockGetRedirects();
      mockDeleteRedirects();

      client.setArgv('redirects', 'remove', '/old-path', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Fetching redirect information');
      await expect(client.stderr).toOutput('Removing redirect for /old-path');
      await expect(client.stderr).toOutput('Redirect removed');
      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should cancel on no', async () => {
      mockGetVersions();
      mockGetRedirects();

      client.setArgv('redirects', 'remove', '/old-path');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Remove this redirect?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Canceled');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should offer to promote when all redirects removed', async () => {
      mockGetVersions();
      mockGetRedirects();
      mockDeleteRedirects({ redirectCount: 0 });
      mockPromoteVersion();

      client.setArgv('redirects', 'remove', '/old-path', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Redirect removed');
      await expect(client.stderr).toOutput(
        'This is the only staged change. Do you want to promote it to production now?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Promoting to production');
      await expect(client.stderr).toOutput('Version promoted to production');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should warn about other staged changes', async () => {
      mockGetVersions({ hasStaging: true });
      mockGetRedirects();
      mockDeleteRedirects({ redirectCount: 5 });

      client.setArgv('redirects', 'remove', '/old-path', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Redirect removed');
      await expect(client.stderr).toOutput('There are other staged changes');

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });

  describe('errors', () => {
    it('should error when redirect not found', async () => {
      mockGetVersions();
      mockGetRedirects({ redirects: [] });

      client.setArgv('redirects', 'remove', '/nonexistent');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Fetching redirect information');
      await expect(client.stderr).toOutput(
        'Redirect with source "/nonexistent" not found. Run vercel redirects list'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
      await exitCodePromise;
    });

    it('should error when no source provided', async () => {
      client.setArgv('redirects', 'remove');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Missing required argument: source');

      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });
});

function mockGetVersions(options?: { hasStaging?: boolean }): void {
  client.scenario.get('/v1/bulk-redirects/versions', (req, res) => {
    const versions = [];
    if (options?.hasStaging) {
      versions.push({
        id: 'existing-staging',
        name: 'existing-staging',
        isStaging: true,
        isLive: false,
        redirectCount: 5,
        lastModified: Date.now(),
        createdBy: 'user@example.com',
      });
    }
    res.json({ versions });
  });
}

function mockGetRedirects(options?: { redirects?: any[] }): void {
  client.scenario.get('/v1/bulk-redirects', (req, res) => {
    res.json({
      redirects: options?.redirects ?? [
        {
          id: 'redirect-1',
          source: '/old-path',
          destination: '/new-path',
          statusCode: 308,
        },
      ],
    });
  });
}

function mockDeleteRedirects(options?: { redirectCount?: number }): void {
  client.scenario.delete('/v1/bulk-redirects', (req, res) => {
    res.json({
      alias: 'test-alias.vercel.app',
      version: {
        id: 'version-1',
        name: 'Test Version',
        redirectCount: options?.redirectCount ?? 0,
      },
    });
  });
}

function mockPromoteVersion(): void {
  client.scenario.post('/v1/bulk-redirects/versions', (req, res) => {
    res.json({
      version: {
        id: 'version-1',
        name: 'Test Version',
        isLive: true,
      },
    });
  });
}
