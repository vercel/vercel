import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('redirects promote', () => {
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
      const subcommand = 'promote';

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

  describe('promote version', () => {
    it('should promote a staging version', async () => {
      mockGetVersions({ isStaging: true });
      mockGetRedirects();
      mockPromoteVersion();

      client.setArgv('redirects', 'promote', 'version-1');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Fetching redirect versions for redirects-test'
      );
      await expect(client.stderr).toOutput('Fetching changes');
      await expect(client.stderr).toOutput('Changes to be promoted:');
      await expect(client.stderr).toOutput(
        'Promote version version-1 to production?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Promoting version version-1');
      await expect(client.stderr).toOutput('Version version-1 promoted');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should skip confirmation with --yes flag', async () => {
      mockGetVersions({ isStaging: true });
      mockGetRedirects();
      mockPromoteVersion();

      client.setArgv('redirects', 'promote', 'version-1', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Fetching changes');
      await expect(client.stderr).toOutput('Promoting version version-1');
      await expect(client.stderr).toOutput('Version version-1 promoted');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should cancel on no', async () => {
      mockGetVersions({ isStaging: true });
      mockGetRedirects();

      client.setArgv('redirects', 'promote', 'version-1');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Promote version version-1 to production?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Canceled');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should show diff with changes', async () => {
      mockGetVersions({ isStaging: true });
      mockGetRedirects({
        redirects: [
          {
            source: '/old1',
            destination: '/new1',
            statusCode: 301,
            action: '+',
          },
          {
            source: '/old2',
            destination: '/new2',
            statusCode: 302,
            action: '-',
          },
        ],
      });
      mockPromoteVersion();

      client.setArgv('redirects', 'promote', 'version-1', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Changes to be promoted:');
      await expect(client.stderr).toOutput('/old1 → /new1');
      await expect(client.stderr).toOutput('/old2 → /new2');

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });

  describe('errors', () => {
    it('should error when version not found', async () => {
      mockGetVersions({ versions: [] });

      client.setArgv('redirects', 'promote', 'nonexistent');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Version with ID or name "nonexistent" not found'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when version is already live', async () => {
      mockGetVersions({ isLive: true });

      client.setArgv('redirects', 'promote', 'version-1');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Version version-1 is already live');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when version is not staging', async () => {
      mockGetVersions({ isStaging: false, isLive: false });

      client.setArgv('redirects', 'promote', 'version-1');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Version version-1 is not staged');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when no version-id provided', async () => {
      client.setArgv('redirects', 'promote');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Missing required argument: version-id'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  it('tracks subcommand invocation', async () => {
    mockGetVersions({ isStaging: true });
    mockGetRedirects();
    mockPromoteVersion();

    client.setArgv('redirects', 'promote', 'version-1', '--yes');
    await redirects(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:promote',
        value: 'promote',
      },
    ]);
  });
});

function mockGetVersions(options?: {
  versions?: any[];
  isStaging?: boolean;
  isLive?: boolean;
}): void {
  client.scenario.get('/v1/bulk-redirects/versions', (req, res) => {
    res.json({
      versions: options?.versions ?? [
        {
          id: 'version-1',
          name: 'version-1',
          isStaging: options?.isStaging ?? false,
          isLive: options?.isLive ?? false,
          redirectCount: 5,
          lastModified: Date.now(),
          createdBy: 'user@example.com',
        },
      ],
    });
  });
}

function mockGetRedirects(options?: { redirects?: any[] }): void {
  client.scenario.get('/v1/bulk-redirects', (req, res) => {
    const isDiff = req.query.diff === 'true';
    const defaultDiffRedirects = [
      {
        source: '/test',
        destination: '/new-test',
        statusCode: 301,
        action: '+',
      },
    ];
    res.json({
      redirects: options?.redirects ?? (isDiff ? defaultDiffRedirects : []),
    });
  });
}

function mockPromoteVersion(): void {
  client.scenario.post('/v1/bulk-redirects/versions', (req, res) => {
    res.json({
      version: {
        id: 'version-1',
        name: 'version-1',
        isLive: true,
      },
    });
  });
}
