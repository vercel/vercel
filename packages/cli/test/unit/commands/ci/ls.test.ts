import stripAnsi from 'strip-ansi';
import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { createCiGitRepo, createCiInvocation } from '../../../mocks/ci';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import ci from '../../../../src/commands/ci';
import chars from '../../../../src/util/output/chars';

type Query = Record<string, string | string[] | undefined>;

function useInvocations(
  body: Record<string, unknown>,
  onRequest?: (query: Query) => void
) {
  client.scenario.get('/v2/vercel-ci/invocations', (req, res) => {
    const query = req.query as Query;
    onRequest?.(query);
    if (query.snapshot && !query.branchName) {
      res.status(400).json({
        error: { code: 'bad_request', message: 'snapshot requires branchName' },
      });
      return;
    }
    res.json({ repositories: {}, pagination: {}, ...body });
  });
}

// Parse controlled POSIX suggestions with printf, without invoking the CLI.
// Windows runners have Git for Windows, whose POSIX shell lives beside Git's
// mingw64/libexec/git-core directory. Do not depend on /bin/sh or WSL there.
function parseSuggestedCommand(command: string): string[] {
  const shell =
    process.platform === 'win32'
      ? join(
          execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(),
          '..',
          '..',
          '..',
          'usr',
          'bin',
          'sh.exe'
        )
      : '/bin/sh';
  return execFileSync(shell, ['-c', `printf '%s\\0' ${command}`], {
    encoding: 'utf8',
  })
    .split('\0')
    .slice(0, -1);
}

describe('ci ls', () => {
  let sha: string;
  let cwd: string;

  beforeEach(() => {
    useUser();
    const repo = createCiGitRepo();
    client.cwd = repo.cwd;
    cwd = repo.cwd;
    sha = repo.sha;
  });

  it('does not ask for a project in a repository linked to several projects', async () => {
    mkdirSync(join(cwd, '.vercel'));
    writeFileSync(
      join(cwd, '.vercel', 'repo.json'),
      JSON.stringify({
        remoteName: 'origin',
        projects: [
          { id: 'prj_docs', name: 'docs', directory: '.', orgId: 'team_a' },
          { id: 'prj_site', name: 'site', directory: '.', orgId: 'team_a' },
        ],
      })
    );
    let query: Query = {};
    useInvocations({ invocations: [createCiInvocation()] }, q => {
      query = q;
    });
    client.config.currentTeam = 'team_current';

    client.setArgv('ci', 'ls');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query.teamId).toBe('team_current');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('Please select a Project');
    expect(stderr).toContain('1 Vercel CI run for vercel/next.js on main');
  }, 10_000);

  it.each([
    'list',
    'ls',
  ])('lists runs for the current branch with %s', async subcommand => {
    let query: Query = {};
    useInvocations(
      {
        invocations: [
          createCiInvocation({
            invocationId: 'invo1_failedrun',
            runConclusion: { result: 'failed' },
            completed: { completedAt: Date.now(), conclusion: 'failed' },
          }),
          createCiInvocation({ invocationId: 'invo1_passedrun' }),
        ],
      },
      q => {
        query = q;
      }
    );

    client.setArgv('ci', subcommand);
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query).toMatchObject({
      provider: 'github',
      repository: 'vercel/next.js',
      branchName: 'main',
    });
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('2 Vercel CI runs for vercel/next.js on main');
    expect(stderr).toContain('failedrun');
    expect(stderr).toContain('failed');
    expect(stderr).not.toContain('invo1_');
  });

  it.each(['list', 'ls'])('prints runs as JSON with %s', async subcommand => {
    const createdAt = Date.UTC(2026, 8, 1);
    useInvocations({
      invocations: [createCiInvocation({ createdAt, commitSha: sha })],
      pagination: { nextCursor: 'cursor_2' },
    });

    client.setArgv('ci', subcommand, '--format', 'json');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      runs: [
        {
          id: 'abc123',
          attempt: 1,
          status: 'succeeded',
          repository: 'vercel/next.js',
          branch: 'main',
          commitSha: sha,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      pagination: { next: 'cursor_2' },
    });
  });

  it('prints an agent payload in non-interactive mode', async () => {
    useInvocations({ invocations: [createCiInvocation()] });
    client.nonInteractive = true;

    client.setArgv('ci', 'ls');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      runs: [expect.objectContaining({ id: 'abc123' })],
      message: 'Found 1 Vercel CI run.',
    });
  });

  it('lists runs for every branch with --all-branches', async () => {
    let query: Query = {};
    useInvocations({ invocations: [] }, q => {
      query = q;
    });

    client.setArgv('ci', 'ls', '--all-branches');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query.branchName).toBeUndefined();
    expect(client.stderr.getFullOutput()).toContain(
      'No Vercel CI runs found for vercel/next.js on all branches.'
    );
  });

  it('expands a short --commit and filters by it', async () => {
    let query: Query = {};
    useInvocations(
      {
        invocations: [
          createCiInvocation({ invocationId: 'invo1_match', commitSha: sha }),
          createCiInvocation({ invocationId: 'invo1_other' }),
        ],
      },
      q => {
        query = q;
      }
    );

    client.setArgv('ci', 'ls', '--commit', sha.slice(0, 7));
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query.snapshot).toBe(sha);
    expect(query.branchName).toBe('main');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('match');
    expect(stderr).not.toContain('other');
  });

  it.each([
    false,
    true,
  ])('accepts --commit with an explicit branch (detached HEAD: %s)', async detached => {
    if (detached) {
      execFileSync('git', ['checkout', '-q', '--detach'], { cwd });
    }
    let query: Query = {};
    useInvocations(
      { invocations: [createCiInvocation({ commitSha: sha })] },
      q => {
        query = q;
      }
    );

    client.setArgv('ci', 'ls', '--commit', sha, '--git-branch', 'shew/fix');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query).toMatchObject({ snapshot: sha, branchName: 'shew/fix' });
  });

  it('rejects --commit with --all-branches before calling the API', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.setArgv('ci', 'ls', '--commit', sha, '--all-branches');

    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't combine --commit with --all-branches. Commit filters require a branch."
    );
    expect(
      fetchSpy.mock.calls.filter(([url]) => url.includes('/v2/vercel-ci/'))
    ).toEqual([]);
  });

  it('requires --git-branch for --commit when HEAD is detached', async () => {
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd });
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.setArgv('ci', 'ls', '--commit', sha.slice(0, 7));

    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '--commit requires a branch. Pass --git-branch when HEAD is detached.'
    );
    expect(
      fetchSpy.mock.calls.filter(([url]) => url.includes('/v2/vercel-ci/'))
    ).toEqual([]);
  });

  it('maps --status failed to the conclusion filter', async () => {
    let query: Query = {};
    useInvocations({ invocations: [] }, q => {
      query = q;
    });

    client.setArgv('ci', 'ls', '--status', 'failed');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query.conclusion).toBe('failed');
    expect(query.status).toBeUndefined();
    expect(client.stderr.getFullOutput()).toContain(
      'No Vercel CI runs match the current filters.'
    );
  });

  it('maps --status running to in-progress statuses', async () => {
    let query: Query = {};
    useInvocations({ invocations: [] }, q => {
      query = q;
    });

    client.setArgv('ci', 'ls', '--status', 'running');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query.status).toEqual(
      expect.arrayContaining(['bootstrapping', 'awaiting_jobs'])
    );
  });

  it('suggests the next page command', async () => {
    useInvocations({
      invocations: [createCiInvocation()],
      pagination: { nextCursor: 'eyJhIjoxfQ==' },
    });

    client.setArgv('ci', 'ls', '--limit', '1');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'ci ls --limit 1 --next eyJhIjoxfQ=='
    );
  });

  it.each([
    ['--scope', '--token'],
    ['-S', '-t'],
    ['--team', '--token'],
    ['-T', '-t'],
  ])('preserves global %s context without echoing %s', async (teamFlag, tokenFlag) => {
    const directory = join(cwd, 'nested directory');
    mkdirSync(directory);
    client.cwd = directory;
    client.nonInteractive = true;
    useInvocations({
      invocations: [createCiInvocation()],
      pagination: { nextCursor: 'cursor_2' },
    });
    client.setArgv(
      teamFlag,
      'team_context',
      '--cwd',
      directory,
      '--non-interactive',
      tokenFlag,
      'secret-pagination-token',
      'ci',
      'ls',
      '--limit',
      '1'
    );

    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const payload = JSON.parse(stdout);
    expect(payload.next).toHaveLength(1);
    const argv = parseSuggestedCommand(payload.next[0].command);
    expect(argv.slice(0, 3)).toEqual(['vercel', 'ci', 'ls']);
    expect(argv).toContain('--cwd');
    expect(argv[argv.indexOf('--cwd') + 1]).toBe(directory);
    expect(argv).toContain('--non-interactive');
    expect(argv[argv.indexOf('--limit') + 1]).toBe('1');
    expect(argv[argv.indexOf('--next') + 1]).toBe('cursor_2');
    const teamIndex = argv.findIndex(arg =>
      ['--scope', '-S', '--team', '-T'].includes(arg)
    );
    expect(teamIndex).toBeGreaterThanOrEqual(0);
    expect(argv[teamIndex + 1]).toBe('team_context');
    expect(argv).not.toContain('--token');
    expect(argv).not.toContain('-t');
    expect(stdout + client.stderr.getFullOutput()).not.toContain(
      'secret-pagination-token'
    );
  });

  it.each([
    false,
    true,
  ])('roundtrips quoted filters and replaces --next (non-interactive: %s)', async nonInteractive => {
    // Only controlled fixture values go through the shell, never remote input.
    const branch = "shew/'quoted'-$HOME;#";
    let query: Query = {};
    useInvocations(
      {
        invocations: [createCiInvocation({ commitSha: sha })],
        pagination: { nextCursor: 'cursor_2' },
      },
      q => {
        query = q;
      }
    );
    client.nonInteractive = nonInteractive;
    client.setArgv(
      'ci',
      'ls',
      '--git-branch',
      branch,
      '--commit',
      sha.slice(0, 7),
      '--status',
      'failed',
      '--limit',
      '1',
      '--next',
      'cursor_1'
    );

    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query).toMatchObject({
      branchName: branch,
      snapshot: sha,
      conclusion: 'failed',
      limit: '1',
      cursor: 'cursor_1',
    });
    const command = nonInteractive
      ? JSON.parse(client.stdout.getFullOutput()).next[0].command
      : stripAnsi(client.stderr.getFullOutput()).match(
          /^ *Next page:\r?\n {4}([^\n]+)/m
        )?.[1];
    expect(command).toBeDefined();
    const argv = parseSuggestedCommand(command!);
    expect(argv.slice(0, 3)).toEqual(['vercel', 'ci', 'ls']);
    const expectedFilters = {
      '--git-branch': branch,
      '--commit': sha.slice(0, 7),
      '--status': 'failed',
      '--limit': '1',
      '--next': 'cursor_2',
    };
    for (const [flag, value] of Object.entries(expectedFilters)) {
      expect(argv.filter(arg => arg === flag)).toHaveLength(1);
      expect(argv[argv.indexOf(flag) + 1]).toBe(value);
    }
    expect(argv).not.toContain('cursor_1');
  });

  describe('the deprecated --branch', () => {
    const DEPRECATED = '--branch is deprecated. Use --git-branch.';

    it('lists runs for the branch, warns, and teaches --git-branch for the next page', async () => {
      let query: Query = {};
      useInvocations(
        {
          invocations: [createCiInvocation()],
          pagination: { nextCursor: 'cursor_2' },
        },
        q => {
          query = q;
        }
      );
      client.setArgv('ci', 'ls', '--branch', 'feat');

      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(query.branchName).toBe('feat');
      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain(`! ${DEPRECATED}`);
      const command = stderr.match(/^ *Next page:\r?\n {4}([^\n]+)/m)?.[1];
      const argv = parseSuggestedCommand(command!);
      expect(argv[argv.indexOf('--git-branch') + 1]).toBe('feat');
      expect(argv).not.toContain('--branch');
    });

    it('does not warn for --git-branch', async () => {
      let query: Query = {};
      useInvocations({ invocations: [] }, q => {
        query = q;
      });
      client.setArgv('ci', 'ls', '--git-branch=feat');

      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(query.branchName).toBe('feat');
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });

    it('skips the warning with --json', async () => {
      useInvocations({ invocations: [] });
      client.setArgv('ci', 'ls', '--branch', 'feat', '--json');

      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain(DEPRECATED);
      expect(JSON.parse(client.stdout.getFullOutput()).runs).toEqual([]);
    });

    it.each([
      false,
      true,
    ])('exits 2 before fetching when both names are given (non-interactive: %s)', async nonInteractive => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
      client.nonInteractive = nonInteractive;
      client.setArgv('ci', 'ls', '--branch', 'main', '--git-branch', 'feat');

      const exitCode = await ci(client);

      expect(exitCode).toBe(2);
      const message = "Can't use --branch with --git-branch. Use --git-branch.";
      if (nonInteractive) {
        expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
          reason: 'invalid_arguments',
          message,
        });
      } else {
        expect(client.stderr.getFullOutput()).toContain(message);
      }
      expect(
        fetchSpy.mock.calls.filter(([url]) => url.includes('/v2/vercel-ci/'))
      ).toEqual([]);
    });
  });

  it.each([
    false,
    true,
  ])('omits unsafe cursor suggestions (non-interactive: %s)', async nonInteractive => {
    useInvocations({
      invocations: [createCiInvocation()],
      pagination: { nextCursor: 'cursor;echo unsafe' },
    });
    client.nonInteractive = nonInteractive;
    client.setArgv('ci', 'ls');

    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    if (nonInteractive) {
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next).toEqual([]);
    }
    expect(client.stderr.getFullOutput()).not.toContain('Next page:');
    expect(client.stderr.getFullOutput()).not.toContain('cursor;echo unsafe');
  });

  it('reports unknown flags as JSON in non-interactive mode before fetching', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.nonInteractive = true;
    client.setArgv('ci', 'ls', '--non-interactive', '--unknown-flag');

    expect(await ci(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('--unknown-flag'),
    });
    expect(client.stderr.getFullOutput()).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lists all branches by default when HEAD is detached without sending a snapshot', async () => {
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd });
    let query: Query = {};
    useInvocations({ invocations: [] }, q => {
      query = q;
    });
    client.setArgv('ci', 'ls');

    expect(await ci(client)).toBe(0);
    expect(query.branchName).toBeUndefined();
    expect(query.snapshot).toBeUndefined();
    expect(client.stderr.getFullOutput()).toContain('on all branches');
  });

  it('reports commit/all-branches conflicts as JSON before fetching', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.nonInteractive = true;
    client.setArgv('ci', 'ls', '--commit', sha, '--all-branches');

    expect(await ci(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message:
        "Can't combine --commit with --all-branches. Commit filters require a branch.",
    });
    expect(client.stderr.getFullOutput()).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown --status', async () => {
    client.setArgv('ci', 'ls', '--status', 'exploded');
    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Status must be one of: queued, running, succeeded, failed, skipped.'
    );
  });

  it.each([
    '--git-branch',
    '--branch',
  ])('rejects %s with --all-branches', async flag => {
    client.setArgv('ci', 'ls', flag, 'main', '--all-branches');
    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't combine --git-branch with --all-branches."
    );
  });

  it('rejects a --commit that is not a SHA', async () => {
    client.setArgv('ci', 'ls', '--commit', 'main;rm');
    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Couldn't resolve --commit to a commit in this repository."
    );
  });

  it('fails outside a Git repository', async () => {
    client.cwd = setupTmpDir();

    client.setArgv('ci', 'ls');
    const exitCode = await ci(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      `${chars.fatal} Couldn't find a supported Git repository here. Vercel CI currently supports GitHub repositories with an origin remote.`
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'GitHub, GitLab, or Bitbucket'
    );
  });

  it.each([
    'https://gitlab.com/acme/app.git',
    'git@gitlab.com:acme/group/app.git',
    'https://bitbucket.org/acme/app.git',
  ])('rejects unsupported remote %s without calling the API', async remote => {
    client.cwd = createCiGitRepo({ remote }).cwd;
    client.nonInteractive = true;
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.setArgv('ci', 'ls', '--non-interactive');

    const exitCode = await ci(client);

    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'git_repository_required',
      message:
        "Couldn't find a supported Git repository here. Vercel CI currently supports GitHub repositories with an origin remote.",
    });
    expect(client.stderr.getFullOutput()).toBe('');
    expect(client.stdout.getFullOutput()).not.toContain(
      'GitHub, GitLab, or Bitbucket'
    );
    expect(
      fetchSpy.mock.calls.filter(([url]) => url.includes('/v2/vercel-ci/'))
    ).toEqual([]);
  });

  it('reports a permission error', async () => {
    client.scenario.get('/v2/vercel-ci/invocations', (_req, res) => {
      res.status(403).json({ error: { code: 'forbidden', message: 'No' } });
    });

    client.setArgv('ci', 'ls');
    const exitCode = await ci(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't list Vercel CI runs."
    );
  });

  it.each([
    ['--git-branch', 'option:git-branch'],
    ['--branch', 'option:branch'],
  ])('tracks %s telemetry without recording user values', async (flag, key) => {
    useInvocations({ invocations: [] });

    client.setArgv('ci', 'ls', flag, 'secret-branch', '--status', 'failed');
    await ci(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'ls' },
      { key, value: '[REDACTED]' },
      { key: 'option:status', value: 'failed' },
    ]);
  });

  it('prints help for the bare command', async () => {
    client.setArgv('ci');
    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('vercel ci');
  });
});
