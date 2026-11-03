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

function useSettings(options: {
  enabled: boolean;
  patchError?: { status: number; code: string };
}) {
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
    if (options.patchError) {
      res.setHeader('retry-after', '0');
      res.status(options.patchError.status).json({
        error: { code: options.patchError.code, message: 'Remote message.' },
      });
      return;
    }
    res.json({
      ...REPO,
      ciEnabled: !options.enabled,
      ciEnabledAt: 2,
      updatedAt: 2,
    });
  });
  return calls;
}

function useSettingsError(status: number, code: string) {
  client.scenario.get(SETTINGS_PATH, (_req, res) => {
    res.setHeader('retry-after', '0');
    res.status(status).json({ error: { code, message: 'Remote message.' } });
  });
}

describe.each(['enable', 'disable'] as const)('ci %s', action => {
  const enabled = action === 'enable';
  const outcome = enabled ? 'enabled' : 'disabled';
  const receipt = enabled ? 'Enabled' : 'Disabled';
  const next = enabled
    ? [
        {
          command: 'vercel ci list',
          when: 'List Vercel CI runs after you push a commit',
        },
      ]
    : [];

  function useCurrentSettings(alreadySet = false) {
    return useSettings({ enabled: alreadySet ? enabled : !enabled });
  }

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
    const calls = useCurrentSettings();
    client.setArgv('ci', action);
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
    const calls = useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action);

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
    const calls = useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action, ...flags);

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
    const calls = useCurrentSettings();
    client.nonInteractive = mode === 'non-interactive';
    client.setArgv(
      'ci',
      action,
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
    const calls = useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action, '--remote', remote);

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
    const calls = useCurrentSettings();
    if (mode === 'piped-stdin') client.stdin.isTTY = false;
    if (mode === 'redirected-stderr') client.stderr.isTTY = false;
    if (mode === 'ci') vi.stubEnv('CI', '1');
    if (mode === 'agent') {
      client.isAgent = true;
      client.nonInteractive = true;
    }
    client.setArgv('ci', action);

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
    const calls = useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action, `--remote=${remote}`);

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
    const calls = useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action, '--remote', 'upstream');

    expect(await ci(client)).toBe(1);
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'git_repository_required',
    });
  });

  it('documents the remote selector in help without API requests', async () => {
    const calls = useCurrentSettings();
    client.setArgv('ci', action, '--help');

    expect(await ci(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('--remote');
    expect(client.stderr.getFullOutput()).toContain('--remote upstream');
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: `ci:${action}` },
    ]);
  });

  it('updates Vercel CI for the origin repository', async () => {
    const calls = useCurrentSettings();
    client.setArgv('ci', action);

    expect(await ci(client)).toBe(0);
    expect(calls.getQuery).toMatchObject(REPO);
    expect(calls.patches).toEqual([
      { query: expect.objectContaining(REPO), body: { ciEnabled: enabled } },
    ]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(receipt);
    expect(stderr).toContain('Vercel CI');
    expect(stderr).toContain('vercel/next.js');
    if (enabled) {
      expect(stderr).toContain('vercel ci list');
    } else {
      expect(stderr).not.toContain('vercel ci list');
    }
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('uses the current team for both settings requests', async () => {
    client.config.currentTeam = 'team_current';
    const calls = useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action);

    expect(await ci(client)).toBe(0);
    expect(calls.getQuery).toMatchObject({ ...REPO, teamId: 'team_current' });
    expect(calls.patches).toEqual([
      {
        query: expect.objectContaining({ ...REPO, teamId: 'team_current' }),
        body: { ciEnabled: enabled },
      },
    ]);
  });

  it('reports a no-op without updating when CI is already in the requested state', async () => {
    const calls = useCurrentSettings(true);
    client.setArgv('ci', action);

    expect(await ci(client)).toBe(0);
    expect(calls.patches).toHaveLength(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      `Vercel CI is already ${outcome} for vercel/next.js.`
    );
    expect(stderr).not.toContain('✓');
    if (!enabled) expect(stderr).not.toContain('vercel ci list');
  });

  it.each([
    ['--json'],
    ['--format', 'json'],
  ])('prints the result as JSON with %j', async (...flags) => {
    const calls = useCurrentSettings();
    client.setArgv('ci', action, ...flags);

    expect(await ci(client)).toBe(0);
    expect(calls.patches).toEqual([
      { query: expect.objectContaining(REPO), body: { ciEnabled: enabled } },
    ]);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      repository: {
        ...REPO,
        ciEnabled: enabled,
        ciEnabledAt: 2,
        updatedAt: 2,
      },
      outcome,
      next,
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('reports the changed result in non-interactive mode', async () => {
    useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action);

    expect(await ci(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      repository: { ...REPO, ciEnabled: enabled, ciEnabledAt: 2, updatedAt: 2 },
      outcome,
      next,
      message: `${receipt} Vercel CI for vercel/next.js.`,
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    false,
    true,
  ])('reports unchanged as JSON with nonInteractive=%s', async nonInteractive => {
    const calls = useCurrentSettings(true);
    client.nonInteractive = nonInteractive;
    client.setArgv('ci', action, ...(nonInteractive ? [] : ['--json']));

    expect(await ci(client)).toBe(0);
    expect(calls.getQuery).toMatchObject(REPO);
    expect(calls.patches).toHaveLength(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      ...(nonInteractive
        ? {
            status: 'ok',
            message: `Vercel CI is already ${outcome} for vercel/next.js.`,
          }
        : {}),
      repository: enabled
        ? { ...REPO, ciEnabled: true, ciEnabledAt: 1, updatedAt: 1 }
        : { ...REPO, ciEnabled: false },
      outcome: 'unchanged',
      next,
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  describe.each(['GET', 'PATCH'] as const)('%s failures', method => {
    it.each([
      [403, 'forbidden', 'permission_denied'],
      [404, 'not_found', 'not_found'],
      [409, 'repository_linked_to_multiple_teams', 'conflict'],
      [429, 'rate_limited', 'rate_limited'],
      [500, 'internal_error', 'api_error'],
    ])('maps a %s response to %s', async (status, code, reason) => {
      if (method === 'GET') {
        useSettingsError(status, code);
      } else {
        useSettings({ enabled: !enabled, patchError: { status, code } });
      }
      client.nonInteractive = true;
      client.setArgv('ci', action);

      expect(await ci(client)).toBe(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({ status: 'error', reason });
      expect(payload.message).not.toContain('Remote message.');
      expect(payload.outcome).toBeUndefined();
      expect(client.stderr.getFullOutput()).toBe('');
    });
  });

  it('does not print a success receipt when updating settings fails', async () => {
    const calls = useSettings({
      enabled: !enabled,
      patchError: { status: 403, code: 'forbidden' },
    });
    client.setArgv('ci', action);

    expect(await ci(client)).toBe(1);
    expect(calls.getQuery).toMatchObject(REPO);
    expect(calls.patches).toEqual([
      { query: expect.objectContaining(REPO), body: { ciEnabled: enabled } },
    ]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(`Can't ${action} Vercel CI for vercel/next.js.`);
    expect(stderr).not.toContain(receipt);
    expect(stderr).not.toContain('✓');
    expect(stderr).not.toContain('vercel ci list');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('explains that the repository must be connected on a 404', async () => {
    useSettingsError(404, 'not_found');
    client.setArgv('ci', action);

    expect(await ci(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Couldn't find vercel/next.js connected to a project on this team."
    );
  });

  it('rejects positional arguments', async () => {
    const calls = useCurrentSettings();
    client.nonInteractive = true;
    client.setArgv('ci', action, 'vercel/next.js');

    expect(await ci(client)).toBe(2);
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
  });

  it.each([
    ['--format', 'yaml'],
    ['--json', '--format', 'text'],
  ])('rejects invalid output options before API requests: %j', async (...flags) => {
    const calls = useCurrentSettings();
    const select = vi.spyOn(client.input, 'select');
    client.nonInteractive = true;
    client.setArgv('ci', action, ...flags);

    expect(await ci(client)).toBe(2);
    expect(calls.getQuery).toBeUndefined();
    expect(calls.patches).toHaveLength(0);
    expect(select).not.toHaveBeenCalled();
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
  });

  it.each([
    { flags: ['--json'], event: { key: 'flag:json', value: 'TRUE' } },
    {
      flags: ['--format', 'json'],
      event: { key: 'option:format', value: 'json' },
    },
  ])('tracks $flags telemetry without recording the remote name', async ({
    flags,
    event,
  }) => {
    execFileSync(
      'git',
      ['remote', 'add', 'private-remote', 'https://github.com/acme/app.git'],
      { cwd: client.cwd }
    );
    useCurrentSettings();
    client.setArgv('ci', action, '--remote', 'private-remote', ...flags);

    expect(await ci(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: `subcommand:${action}`, value: action },
      event,
      { key: 'option:remote', value: '[REDACTED]' },
    ]);
  });

  it('requires a supported Git repository', async () => {
    client.cwd = createCiGitRepo({ remote: '' }).cwd;
    client.nonInteractive = true;
    client.setArgv('ci', action);

    expect(await ci(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'git_repository_required',
    });
  });
});
