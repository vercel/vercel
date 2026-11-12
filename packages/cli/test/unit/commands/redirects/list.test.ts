import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
import { useUser } from '../../../mocks/user';
import { useRedirects, useRedirectVersions } from '../../../mocks/redirects';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

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
      await expect(exitCodePromise).resolves.toEqual(0);

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

  it('lists redirects for the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-redirects',
      name: 'explicit-redirects',
      accountId: 'team_dummy',
    });
    useRedirects(3);
    client.setArgv('redirects', 'list', '--project', 'explicit-redirects');

    await expect(redirects(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('3 Redirects found');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'subcommand:list', value: 'list' },
    ]);
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
      await expect(client.stderr).toOutput(
        'Next page:\n    vercel redirects list --next=2\n'
      );
    });

    it('should not show next page command on last page', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--next', '2');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --next 2"').toEqual(0);
      expect(client.stderr).not.toOutput('Next page:');
    });

    it('should not show pagination info when not provided by server', async () => {
      useRedirects(10, false);
      client.setArgv('redirects', 'list');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list"').toEqual(0);
      expect(client.stderr).not.toOutput('(page');
    });

    it('should support --next option', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--next', '2');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --next 2"').toEqual(0);
      await expect(client.stderr).toOutput('(page 2 of 2)');
    });

    it('should support --limit option', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--limit', '25');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --limit 25"').toEqual(0);
      await expect(client.stderr).toOutput('(page 1 of 4)');
    });

    it('continues accepting --page and --per-page', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--page', '2', '--per-page', '25');
      const exitCode = await redirects(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('(page 2 of 4)');
    });

    it('should handle single page with pagination', async () => {
      useRedirects(25, true);
      client.setArgv('redirects', 'list');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list"').toEqual(0);
      await expect(client.stderr).toOutput('(page 1 of 1)');
      expect(client.stderr).not.toOutput('Next page:');
    });

    it('should preserve search and limit in next page command', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--search', 'test', '--limit', '25');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'vercel redirects list --query test --limit 25 --next=2'
      );
    });

    it('should preserve only search in next page command when using default per-page', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--search', 'test');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'vercel redirects list --query test --next=2'
      );
      expect(client.stderr).not.toOutput('--limit');
    });

    it('should handle page numbers correctly', async () => {
      useRedirects(150, true);
      client.setArgv('redirects', 'list', '--limit', '50', '--next', '3');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code for "redirects list --next 3"').toEqual(0);
      await expect(client.stderr).toOutput('(page 3 of 3)');
      expect(client.stderr).not.toOutput('Next page:');
    });
  });

  describe('combined features', () => {
    it('should support search with pagination', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--search', 'path-1', '--next', '1');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput('matching "path-1"');
      await expect(client.stderr).toOutput('(page 1');
    });

    it('should support search with custom per-page', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--search', 'old', '--limit', '10');
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
        '--next',
        '2',
        '--limit',
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
        '--next',
        '1',
        '--limit',
        '20'
      );
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'vercel redirects list --query /api --limit 20 --next=2'
      );
    });

    it('keeps the --version filter in the next page command', async () => {
      useRedirects(100, true);
      useRedirectVersions();
      client.setArgv(
        'redirects',
        'list',
        '--version',
        'version-1',
        '--search',
        'old'
      );
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'vercel redirects list --version version-1 --query old --next=2'
      );
    });

    it('keeps the --staging filter in the next page command', async () => {
      useRedirects(100, true);
      useRedirectVersions();
      client.setArgv('redirects', 'list', '--staging', '--search', 'old');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      await expect(client.stderr).toOutput(
        'vercel redirects list --staging --query old --next=2'
      );
    });

    it('rejects a --next that is not a cursor before any request', async () => {
      let requested = false;
      client.scenario.get('/v1/bulk-redirects', (_req, res) => {
        requested = true;
        res.json({ redirects: [] });
      });
      client.setArgv('redirects', 'list', '--next', 'oops');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(2);
      expect(requested).toBe(false);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });

    it('warns on the hidden --page and drops it from the next page command', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--page', '1', '--limit', '25');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('! --page is deprecated. Use --next.');
      expect(stderr).toContain(
        'Next page:\n    vercel redirects list --limit 25 --next=2\n'
      );
    });

    it('does not warn on --page with --json', async () => {
      useRedirects(100, true);
      client.setArgv('redirects', 'list', '--page', '1', '--json');
      const exitCode = await redirects(client);
      expect(exitCode, 'exit code').toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(JSON.parse(client.stdout.getFullOutput()).pagination).toEqual({
        next: 2,
      });
    });
  });

  it('writes redirects and the next page to stdout with --json', async () => {
    useRedirects(3, true);
    client.setArgv('redirects', 'list', '--limit', '1', '--json');

    expect(await redirects(client)).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.redirects).toHaveLength(3);
    expect(result.pagination).toEqual({ next: 2 });
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('Fetching redirects');
    expect(stderr).not.toContain('Redirects found');
  });

  describe('renamed options', () => {
    // Runs `redirects list` with a fresh client, recording its requests.
    async function run(...args: string[]) {
      client.reset();
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'redirects-test',
        name: 'redirects-test',
      });
      client.cwd = setupUnitFixture('commands/redirects');
      let versionsRequested = false;
      client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
        versionsRequested = true;
        res.json({
          versions: [{ id: 'version-1', name: 'v1', lastModified: 1 }],
        });
      });
      let query: Record<string, unknown> | undefined;
      client.scenario.get('/v1/bulk-redirects', (req, res) => {
        query = req.query;
        res.json({ redirects: [] });
      });
      client.setArgv('redirects', 'list', ...args);
      const exitCode = await redirects(client);
      return {
        exitCode,
        query,
        versionsRequested,
        stdout: client.stdout.getFullOutput(),
        stderr: client.stderr.getFullOutput(),
      };
    }

    it.each([
      ['--search', ['--search', 'old']],
      ['-s', ['-s', 'old']],
    ])('still accepts %s, with one warning that names --query', async (typed, oldArgs) => {
      const now = await run('--query', 'old');
      const before = await run(...oldArgs);

      expect(now.exitCode).toBe(0);
      expect(now.query).toMatchObject({ q: 'old' });
      expect(now.stderr).not.toContain('deprecated');
      expect(before.exitCode).toBe(0);
      expect(before.query).toEqual(now.query);
      expect(before.stdout).toBe(now.stdout);
      expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
      expect(before.stderr).toContain(
        `! ${typed} is deprecated. Use --query.\n`
      );

      const nowJson = await run('--query', 'old', '--json');
      const beforeJson = await run(...oldArgs, '--json');
      expectDeprecationInJson(
        beforeJson.stdout,
        nowJson.stdout,
        `${typed} is deprecated. Use --query.`
      );
      expect(beforeJson.stderr).not.toContain('deprecated');
    });

    it('keeps -s mixed with --search working, with the last value', async () => {
      const result = await run('-s', 'one', '--search', 'two');

      expect(result.exitCode).toBe(0);
      expect(result.query).toMatchObject({ q: 'two' });
      expect(result.stderr.match(/deprecated/g)).toHaveLength(1);
    });

    it.each([
      [['--query', 'a', '--search', 'b'], "Can't use --query with --search."],
      [['--query', 'a', '-s', 'b'], "Can't use --query with -s."],
    ])('rejects %j before any request', async (args, message) => {
      const result = await run(...args);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(message);
      expect(result.query).toBeUndefined();
    });

    it('lists the version given with --redirects-version', async () => {
      const result = await run('--redirects-version', 'version-1');

      expect(result.exitCode).toBe(0);
      expect(result.versionsRequested).toBe(true);
      expect(result.query).toMatchObject({ versionId: 'version-1' });
      expect(result.stderr).not.toContain('deprecated');
    });

    // `vercel` reads `--version` as its own flag before this command runs, so
    // it never picked a version. It keeps doing nothing, without a warning.
    it.each([
      [['--version', 'version-1']],
      [['--redirects-version', 'version-1', '--version', 'version-2']],
    ])('leaves --version as it was in %j', async args => {
      const without = await run(
        ...args.filter((_, i) => i < args.indexOf('--version'))
      );
      const result = await run(...args);

      expect(result.exitCode).toBe(without.exitCode);
      expect(result.query).toEqual(without.query);
      expect(result.versionsRequested).toBe(without.versionsRequested);
      expect(result.stderr).not.toContain('deprecated');
    });
  });
});
