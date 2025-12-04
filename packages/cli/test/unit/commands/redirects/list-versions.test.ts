import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
import { useUser } from '../../../mocks/user';
import { useRedirectVersions } from '../../../mocks/redirects';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('redirects list-versions', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'redirects-test',
      name: 'redirects-test',
    });
    const cwd = setupUnitFixture('commands/redirects');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'redirects';
      const subcommand = 'list-versions';

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

  it('should list redirect versions', async () => {
    useRedirectVersions(5);
    client.setArgv('redirects', 'list-versions');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects list-versions"').toEqual(0);
    await expect(client.stderr).toOutput('5 Versions found');
    await expect(client.stderr).toOutput('version-0');
  });

  it('should list redirect versions using ls-versions alias', async () => {
    useRedirectVersions(3);
    client.setArgv('redirects', 'ls-versions');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects ls-versions"').toEqual(0);
    await expect(client.stderr).toOutput('3 Versions found');
  });

  it('tracks subcommand invocation', async () => {
    useRedirectVersions(5);
    client.setArgv('redirects', 'list-versions');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects list-versions"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list-versions',
        value: 'list-versions',
      },
    ]);
  });

  it('should handle empty versions list', async () => {
    useRedirectVersions(0);
    client.setArgv('redirects', 'list-versions');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects list-versions"').toEqual(0);
    await expect(client.stderr).toOutput('0 Versions found');
  });

  describe('version display', () => {
    it('should display staging version status', async () => {
      useRedirectVersions(5);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('Staging');
    });

    it('should display live version status', async () => {
      useRedirectVersions(5);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('Live');
    });

    it('should display previous version status', async () => {
      useRedirectVersions(5);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('Previous');
    });

    it('should display redirect count', async () => {
      useRedirectVersions(3);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('Redirects');
    });

    it('should display created by information', async () => {
      useRedirectVersions(3);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('user0@example.com');
    });

    it('should display unnamed versions', async () => {
      useRedirectVersions(2);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('(unnamed)');
    });
  });

  describe('sorting', () => {
    it('should show all version statuses', async () => {
      useRedirectVersions(5);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('5 Versions found');
    });
  });

  describe('limits', () => {
    it('should limit to 20 versions', async () => {
      useRedirectVersions(25);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('20 Versions found');
    });

    it('should show all versions when less than 20', async () => {
      useRedirectVersions(10);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('10 Versions found');
    });
  });

  describe('edge cases', () => {
    it('should handle missing redirect count', async () => {
      client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
        res.json({
          versions: [
            {
              id: 'version-1',
              lastModified: Date.now(),
              createdBy: 'user@example.com',
              name: 'Test Version',
              isLive: true,
              // redirectCount is missing
            },
          ],
        });
      });

      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('-');
    });

    it('should handle missing createdBy', async () => {
      client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
        res.json({
          versions: [
            {
              id: 'version-1',
              lastModified: Date.now(),
              // createdBy is missing
              name: 'Test Version',
              isLive: true,
              redirectCount: 5,
            },
          ],
        });
      });

      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('(unknown)');
    });

    it('should handle null redirect count', async () => {
      client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
        res.json({
          versions: [
            {
              id: 'version-1',
              lastModified: Date.now(),
              createdBy: 'user@example.com',
              name: 'Test Version',
              isLive: true,
              redirectCount: null,
            },
          ],
        });
      });

      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('-');
    });

    it('should handle zero redirect count', async () => {
      client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
        res.json({
          versions: [
            {
              id: 'version-1',
              lastModified: Date.now(),
              createdBy: 'user@example.com',
              name: 'Test Version',
              isLive: true,
              redirectCount: 0,
            },
          ],
        });
      });

      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('0');
    });
  });

  describe('table formatting', () => {
    it('should display ID and version data', async () => {
      useRedirectVersions(3);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('version-0');
    });

    it('should display all required columns', async () => {
      useRedirectVersions(1);
      client.setArgv('redirects', 'list-versions');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('Created By');
    });
  });
});
