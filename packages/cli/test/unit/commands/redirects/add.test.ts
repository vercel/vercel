import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('redirects add', () => {
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
      const subcommand = 'add';

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

  describe('interactive mode', () => {
    it('should add a redirect with status 307', async () => {
      mockGetVersions();
      mockPutRedirects();
      mockPromoteVersion();

      client.setArgv('redirects', 'add');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('What is the source URL?');
      client.stdin.write('/old-path\n');

      await expect(client.stderr).toOutput('What is the destination URL?');
      client.stdin.write('/new-path\n');

      await expect(client.stderr).toOutput('Select the status code:');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should the redirect be case sensitive?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should query parameters be preserved?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Adding redirect');
      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('/old-path → /new-path');
      await expect(client.stderr).toOutput('Status: 307');
      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('y\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add a redirect with version name', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('What is the source URL?');
      client.stdin.write('/old\n');

      await expect(client.stderr).toOutput('What is the destination URL?');
      client.stdin.write('/new\n');

      await expect(client.stderr).toOutput('Select the status code:');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should the redirect be case sensitive?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should query parameters be preserved?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Version name');
      client.stdin.write('My Version\n');

      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should offer to promote when it is the only staged change', async () => {
      mockGetVersions();
      mockPutRedirects({ redirectCount: 1 });
      mockPromoteVersion();

      client.setArgv('redirects', 'add');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('What is the source URL?');
      client.stdin.write('/path\n');

      await expect(client.stderr).toOutput('What is the destination URL?');
      client.stdin.write('/dest\n');

      await expect(client.stderr).toOutput('Select the status code:');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should the redirect be case sensitive?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should query parameters be preserved?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Redirect added');
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
      mockPutRedirects({ redirectCount: 5 });

      client.setArgv('redirects', 'add');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('What is the source URL?');
      client.stdin.write('/path\n');

      await expect(client.stderr).toOutput('What is the destination URL?');
      client.stdin.write('/dest\n');

      await expect(client.stderr).toOutput('Select the status code:');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should the redirect be case sensitive?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should query parameters be preserved?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('There are other staged changes');

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });

  it('tracks subcommand invocation', async () => {
    mockGetVersions();
    mockPutRedirects();

    client.setArgv('redirects', 'add');
    const exitCodePromise = redirects(client);

    await expect(client.stderr).toOutput('What is the source URL?');
    client.stdin.write('/src\n');

    await expect(client.stderr).toOutput('What is the destination URL?');
    client.stdin.write('/dst\n');

    await expect(client.stderr).toOutput('Select the status code:');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Should the redirect be case sensitive?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Should query parameters be preserved?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to provide a name for this version?'
    );
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('promote it to production');
    client.stdin.write('n\n');

    await exitCodePromise;

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:add',
        value: 'add',
      },
    ]);
  });

  describe('non-interactive mode', () => {
    it('should add a redirect with positional arguments', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add', '/old-path', '/new-path');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Select the status code:');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should the redirect be case sensitive?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Should query parameters be preserved?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('/old-path → /new-path');
      await expect(client.stderr).toOutput('Status: 307');

      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add a redirect with all flags', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv(
        'redirects',
        'add',
        '/old',
        '/new',
        '--status',
        '302',
        '--case-sensitive',
        '--preserve-query-params',
        '--name',
        'Test Version'
      );
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('/old → /new');
      await expect(client.stderr).toOutput('Status: 302');
      await expect(client.stderr).toOutput('Case sensitive: Yes');
      await expect(client.stderr).toOutput('Preserve query params: Yes');

      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add a redirect with minimal flags', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add', '/source', '/dest', '--status', '308');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Should the redirect be case sensitive?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Should query parameters be preserved?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('/source → /dest');
      await expect(client.stderr).toOutput('Status: 308');
      await expect(client.stderr).toOutput('Case sensitive: Yes');
      await expect(client.stderr).toOutput('Preserve query params: No');

      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should error on invalid status code', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add', '/old', '/new', '--status', '404');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Status code must be 301, 302, 307, or 308'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid source URL', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add', 'invalid-path', '/new');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Source must be a relative path (starting with /) or an absolute URL'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid destination URL', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add', '/old', 'invalid-path');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Destination must be a relative path (starting with /) or an absolute URL'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on version name that is too long', async () => {
      mockGetVersions();
      mockPutRedirects();

      const longName = 'a'.repeat(257);
      client.setArgv(
        'redirects',
        'add',
        '/old',
        '/new',
        '--yes',
        '--name',
        longName
      );
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Name must be 256 characters or less'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should add a redirect with --yes flag', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add', '/old', '/new', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('/old → /new');
      await expect(client.stderr).toOutput('Status: 307');
      await expect(client.stderr).toOutput('Case sensitive: No');
      await expect(client.stderr).toOutput('Preserve query params: No');

      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should combine --yes with other flags', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv(
        'redirects',
        'add',
        '/source',
        '/dest',
        '--yes',
        '--status',
        '301',
        '--case-sensitive'
      );
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('/source → /dest');
      await expect(client.stderr).toOutput('Status: 301');
      await expect(client.stderr).toOutput('Case sensitive: Yes');
      await expect(client.stderr).toOutput('Preserve query params: No');

      await expect(client.stderr).toOutput('promote it to production');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should error when --yes is used without source and destination', async () => {
      mockGetVersions();
      mockPutRedirects();

      client.setArgv('redirects', 'add', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Source and destination are required when using --yes'
      );

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

function mockPutRedirects(options?: { redirectCount?: number }): void {
  client.scenario.put('/v1/bulk-redirects', (req, res) => {
    res.json({
      alias: 'test-alias.vercel.app',
      version: {
        id: 'version-1',
        name: 'Test Version',
        redirectCount: options?.redirectCount ?? 1,
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
