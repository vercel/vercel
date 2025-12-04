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
    it('should add a redirect with status 301', async () => {
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
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Adding redirect');
      await expect(client.stderr).toOutput('Redirect added');
      await expect(client.stderr).toOutput('/old-path → /new-path');
      await expect(client.stderr).toOutput('Status: 301');
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
