import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
import { useUser } from '../../../mocks/user';
import { useRedirects } from '../../../mocks/redirects';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('redirects list', () => {
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
      const subcommand = 'list';

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

  it('should list redirects', async () => {
    useRedirects(3);
    client.setArgv('redirects', 'list');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects list"').toEqual(0);
    await expect(client.stderr).toOutput('3 Redirects found');
  });

  it('should list redirects using ls alias', async () => {
    useRedirects(2);
    client.setArgv('redirects', 'ls');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects ls"').toEqual(0);
    await expect(client.stderr).toOutput('2 Redirects found');
  });

  it('tracks subcommand invocation', async () => {
    useRedirects(3);
    client.setArgv('redirects', 'list');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects list"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'list',
      },
    ]);
  });

  it('tracks subcommand invocation with alias', async () => {
    useRedirects(3);
    client.setArgv('redirects', 'ls');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects ls"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'ls',
      },
    ]);
  });

  it('should handle empty redirects list', async () => {
    useRedirects(0);
    client.setArgv('redirects', 'list');
    const exitCode = await redirects(client);
    expect(exitCode, 'exit code for "redirects list"').toEqual(0);
    await expect(client.stderr).toOutput('0 Redirects found');
  });

  describe('--search', () => {
    it('should search for redirects', async () => {
      useRedirects(5);
      client.setArgv('redirects', 'list', '--search', '/old-path-1');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --search"').toEqual(0);
      await expect(client.stderr).toOutput('matching "/old-path-1"');
      await expect(client.stderr).toOutput('/old-path-1');
    });

    it('should use shorthand -s flag', async () => {
      useRedirects(5);
      client.setArgv('redirects', 'list', '-s', '/old-path-2');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list -s"').toEqual(0);
      await expect(client.stderr).toOutput('matching "/old-path-2"');
    });

    it('should handle search with no results', async () => {
      useRedirects(5);
      client.setArgv('redirects', 'list', '--search', 'nonexistent');
      const exitCode = await redirects(client);
      expect(
        exitCode,
        'exit code for "redirects list --search nonexistent"'
      ).toEqual(0);
      await expect(client.stderr).toOutput('0 Redirects found');
    });

    it('should search in both source and destination', async () => {
      useRedirects(5);
      client.setArgv('redirects', 'list', '--search', 'path');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --search path"').toEqual(
        0
      );
      await expect(client.stderr).toOutput('5 Redirects found');
    });

    it('tracks telemetry for search option', async () => {
      useRedirects(5);
      client.setArgv('redirects', 'list', '--search', 'test');
      await redirects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'list',
        },
      ]);
    });
  });

  describe('pagination', () => {
    it('should display pagination info when available', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list"').toEqual(0);
      await expect(client.stderr).toOutput('(page 1 of 2)');
    });

    it('should show next page command when more pages exist', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list"').toEqual(0);
      await expect(client.stderr).toOutput('redirects list --page 2');
    });

    it('should not show next page command on last page', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--page', '2');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --page 2"').toEqual(0);
      expect(client.stderr).not.toOutput('To display the next page');
    });

    it('should not show pagination info when not provided by server', async () => {
      useRedirects(10, false);
      client.setArgv('redirects', 'list');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list"').toEqual(0);
      expect(client.stderr).not.toOutput('(page');
    });

    it('should support --page option', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--page', '2');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --page 2"').toEqual(0);
      await expect(client.stderr).toOutput('(page 2 of 2)');
    });

    it('should support --per-page option', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--per-page', '25');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --per-page 25"').toEqual(
        0
      );
      await expect(client.stderr).toOutput('(page 1 of 4)');
    });

    it('should use default per_page of 50', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list"').toEqual(0);
      await expect(client.stderr).toOutput('(page 1 of 2)');
    });

    it('should handle single page with pagination', async () => {
      useRedirects(25, true);
      client.setArgv('redirects', 'list');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list"').toEqual(0);
      await expect(client.stderr).toOutput('(page 1 of 1)');
      expect(client.stderr).not.toOutput('To display the next page');
    });

    it('should preserve search and per-page in next page command', async () => {
      useRedirects(100, true);
      client.setArgv(
        'redirects',
        'list',
        '--search',
        'test',
        '--per-page',
        '25'
      );
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'redirects list --page 2 --search "test" --per-page 25'
      );
    });

    it('should preserve only search in next page command when using default per-page', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--search', 'test');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'redirects list --page 2 --search "test"'
      );
      expect(client.stderr).not.toOutput('--per-page');
    });

    it('should handle page numbers correctly', async () => {
      useRedirects(150, true);
      client.setArgv('redirects', 'list', '--per-page', '50', '--page', '3');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --page 3"').toEqual(0);
      await expect(client.stderr).toOutput('(page 3 of 3)');
      expect(client.stderr).not.toOutput('To display the next page');
    });
  });

  describe('combined features', () => {
    it('should support search with pagination', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--search', 'path-1', '--page', '1');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('matching "path-1"');
      await expect(client.stderr).toOutput('(page 1');
    });

    it('should support search with custom per-page', async () => {
      useRedirects(100, true);
      client.setArgv(
        'redirects',
        'list',
        '--search',
        'old',
        '--per-page',
        '10'
      );
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('matching "old"');
      await expect(client.stderr).toOutput('(page 1 of 10)');
    });

    it('should work with all options combined', async () => {
      useRedirects(100, true);
      client.setArgv(
        'redirects',
        'list',
        '--search',
        'test',
        '--page',
        '2',
        '--per-page',
        '20'
      );
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('matching "test"');
      await expect(client.stderr).toOutput('(page 2 of 5)');
    });

    it('should generate correct next page command with all filters', async () => {
      useRedirects(100, true);
      client.setArgv(
        'redirects',
        'list',
        '--search',
        '/api',
        '--page',
        '1',
        '--per-page',
        '20'
      );
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'redirects list --page 2 --search "/api" --per-page 20'
      );
    });
  });
});
