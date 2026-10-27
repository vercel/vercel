import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { createCiGitRepo } from '../../../mocks/ci';
import ci from '../../../../src/commands/ci';

const SETTINGS_PATH = '/v1/vercel-ci/repository-settings';

const REPO = {
  provider: 'github',
  organizationId: 'vercel',
  repository: 'next.js',
};

function useSettings(options: { enabled?: boolean } = {}) {
  const calls = {
    getQuery: undefined as Record<string, unknown> | undefined,
    patches: [] as Array<{ query: Record<string, unknown>; body: unknown }>,
  };
  client.scenario.get(SETTINGS_PATH, (req, res) => {
    calls.getQuery = req.query;
    res.json(
      options.enabled
        ? { ...REPO, ciEnabled: true, ciEnabledAt: 1, updatedAt: 1 }
        : { ...REPO, ciEnabled: false }
    );
  });
  client.scenario.patch(SETTINGS_PATH, (req, res) => {
    calls.patches.push({ query: req.query, body: req.body });
    res.json({ ...REPO, ciEnabled: true, ciEnabledAt: 2, updatedAt: 2 });
  });
  return calls;
}

function useSettingsError(status: number, code: string) {
  client.scenario.get(SETTINGS_PATH, (_req, res) => {
    res.setHeader('retry-after', '0');
    res.status(status).json({ error: { code, message: 'Remote message.' } });
  });
}

describe('ci enable', () => {
  beforeEach(() => {
    vi.stubEnv('CI', '');
    useUser();
    client.cwd = createCiGitRepo().cwd;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function addUpstream() {
    execFileSync(
      'git',
      ['remote', 'add', 'upstream', 'https://github.com/acme/app.git'],
      { cwd: client.cwd }
    );
  }

  it.each([
    true,
    false,
  ])('selects a remote interactively with stdout TTY=%s', async stdoutIsTTY => {
    client.stdout.isTTY = stdoutIsTTY;
    addUpstream();
    const calls = useSettings();
    client.setArgv('ci', 'enable');
    const result = ci(client);

    await expect(client.stderr).toOutput('Which Git remote should be used?');
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    client.stdin.write('\u001b[B\r');

    expect(await result).toBe(0);
    const selectedRepo = {
      ...REPO,
      organizationId: 'acme',
      repository: 'app',
    };
    expect(calls.getQuery).toMatchObject(selectedRepo);
    expect(calls.patches[0].query).toMatchObject(selectedRepo);
    expect(client.stderr.getFullOutput()).toContain('acme/app');
    expect(client.stderr.getFullOutput()).not.toContain('vercel ci list');
  });

  it('uses the only remote even when it is not origin', async () => {
    execFileSync('git', ['remote', 'rename', 'origin', 'upstream'], {
      cwd: client.cwd,
    });
    const select = vi.spyOn(client.input, 'select');
    const calls = useSettings();
    client.nonInteractive = true;
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(0);
    expect(calls.getQuery).toMatchObject(REPO);
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    ['--remote', 'upstream'],
    ['--remote=upstream'],
    ['--remote', 'upstream', '--json'],
  ])('uses an explicit remote without prompting: %j', async (...flags) => {
    addUpstream();
    const select = vi.spyOn(client.input, 'select');
    const calls = useSettings();
    client.nonInteractive = true;
    client.setArgv('ci', 'enable', ...flags);

    expect(await ci(client)).toBe(0);
    const selectedRepo = { ...REPO, organizationId: 'acme', repository: 'app' };
    expect(calls.getQuery).toMatchObject(selectedRepo);
    expect(calls.patches[0].query).toMatchObject(selectedRepo);
    expect(select).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toBe('');
    expect(JSON.parse(client.stdout.getFullOutput()).next).toEqual([]);
  });

  it.each([
    'non-interactive',
    'json',
    'format-json',
  ])('requires --remote with multiple remotes in %s mode', async mode => {
    addUpstream();
    const select = vi.spyOn(client.input, 'select');
    const calls = useSettings();
    client.nonInteractive = mode === 'non-interactive';
    client.setArgv(
      'ci',
      'enable',
      ...(mode === 'json'
        ? ['--json']
        : mode === 'format-json'
          ? ['--format', 'json']
          : [])
    );

    expect(await ci(client)).toBe(2);
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    expect(select).not.toHaveBeenCalled();
    const error =
      client.stdout.getFullOutput() || client.stderr.getFullOutput();
    expect(error).toContain('multiple Git remotes');
    expect(error).toContain('--remote <NAME>');
  });

  it.each([
    'dotted-name',
    'included-config',
    'worktree',
  ])('discovers effective Git remotes: %s', async mode => {
    let remote = 'upstream';
    if (mode === 'dotted-name') {
      remote = 'upstream.dev';
      execFileSync(
        'git',
        ['remote', 'add', remote, 'https://github.com/acme/app.git'],
        { cwd: client.cwd }
      );
    } else if (mode === 'included-config') {
      const configPath = join(client.cwd, 'extra-git-config');
      writeFileSync(
        configPath,
        '[remote "upstream"]\nurl = https://github.com/acme/app.git\n'
      );
      execFileSync('git', ['config', 'include.path', configPath], {
        cwd: client.cwd,
      });
    } else {
      addUpstream();
      const worktree = join(client.cwd, 'worktree');
      execFileSync('git', ['worktree', 'add', '--detach', worktree], {
        cwd: client.cwd,
        stdio: 'pipe',
      });
      client.cwd = worktree;
    }
    const calls = useSettings();
    client.nonInteractive = true;
    client.setArgv('ci', 'enable', '--remote', remote);

    expect(await ci(client)).toBe(0);
    expect(calls.getQuery).toMatchObject({
      organizationId: 'acme',
      repository: 'app',
    });
  });

  it.each([
    'piped-stdin',
    'redirected-stderr',
    'ci',
    'agent',
  ])('does not prompt in %s mode', async mode => {
    addUpstream();
    const select = vi.spyOn(client.input, 'select');
    const calls = useSettings();
    if (mode === 'piped-stdin') client.stdin.isTTY = false;
    if (mode === 'redirected-stderr') client.stderr.isTTY = false;
    if (mode === 'ci') vi.stubEnv('CI', '1');
    if (mode === 'agent') {
      client.isAgent = true;
      client.nonInteractive = true;
    }
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(2);
    expect(select).not.toHaveBeenCalled();
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    const error =
      client.stdout.getFullOutput() || client.stderr.getFullOutput();
    expect(error).toContain('--remote <NAME>');
  });

  it.each([
    'missing',
    '',
    'https://github.com/acme/app.git',
  ])('rejects an invalid remote %j without falling back to origin', async remote => {
    const select = vi.spyOn(client.input, 'select');
    const calls = useSettings();
    client.nonInteractive = true;
    client.setArgv('ci', 'enable', `--remote=${remote}`);

    expect(await ci(client)).toBe(2);
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    expect(select).not.toHaveBeenCalled();
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining(
        '--remote must name an existing Git remote'
      ),
    });
  });

  it('rejects an unsupported selected remote rather than using origin', async () => {
    execFileSync(
      'git',
      ['remote', 'add', 'upstream', 'https://gitlab.com/acme/app.git'],
      { cwd: client.cwd }
    );
    const calls = useSettings();
    client.nonInteractive = true;
    client.setArgv('ci', 'enable', '--remote', 'upstream');

    expect(await ci(client)).toBe(1);
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'git_repository_required',
    });
  });

  it('documents the remote selector in help without API requests', async () => {
    const calls = useSettings();
    client.setArgv('ci', 'enable', '--help');

    expect(await ci(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('--remote');
    expect(client.stderr.getFullOutput()).toContain('--remote upstream');
    expect(calls.getQuery).toBeUndefined();
  });

  it('enables Vercel CI for the origin repository', async () => {
    const calls = useSettings();
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(0);
    expect(calls.getQuery).toMatchObject(REPO);
    expect(calls.patches).toEqual([
      { query: expect.objectContaining(REPO), body: { ciEnabled: true } },
    ]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Enabled');
    expect(stderr).toContain('vercel/next.js');
    expect(stderr).toContain('vercel ci list');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('reports a no-op without updating when CI is already enabled', async () => {
    const calls = useSettings({ enabled: true });
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(0);
    expect(calls.patches).toHaveLength(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Vercel CI is already enabled for vercel/next.js.'
    );
    expect(stderr).not.toContain('✓');
  });

  it('prints the result as JSON with --json', async () => {
    useSettings();
    client.setArgv('ci', 'enable', '--json');

    expect(await ci(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      repository: { ...REPO, ciEnabled: true, ciEnabledAt: 2, updatedAt: 2 },
      outcome: 'enabled',
      next: [
        {
          command: 'vercel ci list',
          when: 'List Vercel CI runs after you push a commit',
        },
      ],
    });
  });

  it('reports unchanged in non-interactive mode', async () => {
    useSettings({ enabled: true });
    client.nonInteractive = true;
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      outcome: 'unchanged',
      repository: { ciEnabled: true },
      message: 'Vercel CI is already enabled for vercel/next.js.',
    });
  });

  it.each([
    [403, 'forbidden', 'permission_denied'],
    [404, 'not_found', 'not_found'],
    [409, 'repository_linked_to_multiple_teams', 'conflict'],
    [429, 'rate_limited', 'rate_limited'],
    [500, 'internal_error', 'api_error'],
  ])('maps a %s response to %s', async (status, code, reason) => {
    useSettingsError(status, code);
    client.nonInteractive = true;
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({ status: 'error', reason });
    expect(payload.message).not.toContain('Remote message.');
  });

  it('explains that the repository must be connected on a 404', async () => {
    useSettingsError(404, 'not_found');
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Couldn't find vercel/next.js connected to a project on this team."
    );
  });

  it('rejects positional arguments', async () => {
    const calls = useSettings();
    client.nonInteractive = true;
    client.setArgv('ci', 'enable', 'vercel/next.js');

    expect(await ci(client)).toBe(2);
    expect(calls.getQuery).toBeUndefined();
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
  });

  it('requires a supported Git repository', async () => {
    client.cwd = createCiGitRepo({ remote: '' }).cwd;
    client.nonInteractive = true;
    client.setArgv('ci', 'enable');

    expect(await ci(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'git_repository_required',
    });
  });
});
