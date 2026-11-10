import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execCli } from '../helpers/exec';
import { getCliPath } from '../helpers/get-cli-path';

const binaryPath = getCliPath();

describe('local schedules bootstrap', () => {
  let directory: string;
  let authPath: string;
  let preloadPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vc-local-schedules-bootstrap-'));
    authPath = join(directory, 'auth.json');
    preloadPath = join(directory, 'no-network.cjs');
    await writeFile(
      join(directory, 'config.json'),
      JSON.stringify({
        credStorage: 'file',
        currentTeam: 'team_saved',
        telemetry: { enabled: false },
      })
    );
    await writeFile(
      join(directory, 'vercel.json'),
      JSON.stringify({ scope: 'configured-team' })
    );
    // Exercise real bootstrap in a subprocess, but fail before any accidental
    // cloud request can escape (including OAuth refresh and user attribution).
    await writeFile(
      preloadPath,
      `const rejectNetwork = () => {
  process.stderr.write('UNEXPECTED_NETWORK_REQUEST\\n');
  throw new Error('Network is forbidden in this bootstrap test');
};
globalThis.fetch = rejectNetwork;
for (const protocol of ['node:http', 'node:https']) {
  const transport = require(protocol);
  transport.request = rejectNetwork;
  transport.get = rejectNetwork;
}
`
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function run(
    args: string[],
    env: Record<string, string> = {},
    forceHumanOutput = true
  ) {
    return execCli(
      binaryPath,
      [
        '-Q',
        directory,
        '--cwd',
        directory,
        ...(forceHumanOutput ? ['--non-interactive=false'] : []),
        ...args,
      ],
      {
        cwd: directory,
        token: false,
        scope: false,
        timeout: 30_000,
        env: {
          CI: '1',
          FORCE_TTY: '0',
          VERCEL_TOKEN: '',
          VERCEL_SCOPE: '',
          VERCEL_TEAM_ID: '',
          VERCEL_ORG_ID: '',
          VERCEL_PROJECT_ID: '',
          VERCEL_TELEMETRY_DISABLED: '1',
          NODE_OPTIONS: `--require ${JSON.stringify(preloadPath)}`,
          ...env,
        },
      }
    );
  }

  it.each([
    '--local',
    '-L',
  ])('reaches local validation without credentials (%s)', async flag => {
    const result = await run(['schedules', 'inspect', flag]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('A schedule name is required');
    expect(result.stderr).not.toContain('No existing credentials');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    await expect(readFile(authPath, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('does not read or rewrite broken persisted credentials', async () => {
    await writeFile(authPath, '{broken auth storage');
    const result = await run(['schedules', '--local', 'inspect']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('A schedule name is required');
    expect(result.stderr).not.toContain('auth config');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(await readFile(authPath, 'utf8')).toBe('{broken auth storage');
  });

  it.each([
    0, 4_000_000_000,
  ])('ignores saved tokens, scope, and user lookup (expiresAt=%s)', async expiresAt => {
    const auth = JSON.stringify({
      token: 'saved_token',
      refreshToken: 'saved_refresh_token',
      expiresAt,
    });
    await writeFile(authPath, auth);
    const result = await run(['schedules', 'inspect', '--local']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('A schedule name is required');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(await readFile(authPath, 'utf8')).toBe(auth);
  });

  it('ignores ambient tokens and team/project selectors', async () => {
    const result = await run(['--local', 'schedules', 'inspect'], {
      VERCEL_TOKEN: 'invalid/ambient/token',
      VERCEL_SCOPE: 'ambient-team',
      VERCEL_TEAM_ID: 'team_ambient',
      VERCEL_ORG_ID: 'team_ambient',
      VERCEL_PROJECT_ID: 'prj_ambient',
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('A schedule name is required');
    expect(result.stderr).not.toContain('invalid/ambient/token');
    expect(result.stderr).not.toContain('contents are invalid');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
  });

  it('ignores an unsupported ambient proxy for local schedules', async () => {
    const result = await run(['schedules', 'inspect', '--local'], {
      ALL_PROXY: 'socks5://127.0.0.1:1080',
      all_proxy: '',
      HTTP_PROXY: '',
      http_proxy: '',
      HTTPS_PROXY: '',
      https_proxy: '',
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('A schedule name is required');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
  });

  it('preserves the deprecated get alias in local mode', async () => {
    const result = await run(['schedules', 'get', '--local']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('A schedule name is required');
    expect(result.stderr).toContain('deprecated');
    expect(result.stderr).toContain('schedules inspect');
    expect(result.stderr).not.toContain('No existing credentials');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
  });

  it.each(
    [
      ['schedules', 'list', '--local', '--unknown'],
      ['schedules', 'list', '--unknown', '--local'],
      ['--local', 'schedules', 'list', '--unknown'],
      ['schedules', '--local', 'list', '--unknown'],
      ['schedules', 'list', '--local', '--namespace'],
      ['schedules', 'list', '--namespace', '--local'],
      ['-L', 'schedules', 'list', '--namespace'],
      ['schedules', '-L', 'list', '--namespace'],
    ].flatMap(args =>
      ['broken', 'expired', 'valid'].map(storage => ({ args, storage }))
    )
  )('rejects malformed schedules before $storage auth: $args', async ({
    args,
    storage,
  }) => {
    const auth =
      storage === 'broken'
        ? '{broken auth storage'
        : JSON.stringify({
            token: 'saved_token',
            refreshToken: 'saved_refresh_token',
            expiresAt: storage === 'expired' ? 0 : 4_000_000_000,
          });
    await writeFile(authPath, auth);
    const result = await run(args);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(
      /unknown or unexpected option: --unknown|option requires argument: --namespace/
    );
    expect(result.stderr).not.toContain('auth config');
    expect(result.stderr).not.toContain('No existing credentials');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(await readFile(authPath, 'utf8')).toBe(auth);
  });

  it.each([
    ['--token', 'secret/token'],
    ['--token=secret/token'],
    ['-t', 'secret/token'],
    ['--scope', 'explicit-team'],
    ['--scope=explicit-team'],
    ['-S', 'explicit-team'],
    ['--team', 'explicit-team'],
    ['-T', 'explicit-team'],
  ])('rejects explicit cloud selectors before auth: %j', async (...selectors) => {
    await writeFile(authPath, '{broken auth storage');
    const result = await run(['schedules', 'list', '-L', ...selectors]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "Can't combine `--local` with `--token`, `--scope`, or `--team`."
    );
    expect(result.stderr).not.toContain('secret/token');
    expect(result.stderr).not.toContain('auth config');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
  });

  it.each(
    ['--local', '-L'].flatMap(local =>
      ['--token', '--scope', '--team'].flatMap(selector =>
        [
          {
            mode: 'non-interactive',
            options: ['--non-interactive'],
            json: true,
          },
          { mode: 'agent', options: [], json: true },
          {
            mode: 'equals-false',
            options: ['--non-interactive', '--non-interactive=false'],
            json: false,
          },
          {
            mode: 'separate-false',
            options: ['--non-interactive', 'false'],
            json: false,
          },
        ].map(mode => ({ local, selector, ...mode }))
      )
    )
  )('rejects $local $selector in $mode mode before config or auth', async ({
    local,
    selector,
    mode,
    options,
    json,
  }) => {
    await writeFile(join(directory, 'config.json'), '{broken global config');
    await writeFile(authPath, '{broken auth storage');
    const result = await run(
      [
        'schedules',
        'list',
        local,
        selector,
        'explicit-selector-value',
        ...options,
      ],
      {
        AI_AGENT: mode === 'non-interactive' ? '' : 'test-agent',
        VERCEL_TOKEN: 'invalid/ambient/token',
      },
      false
    );
    const message =
      "Can't combine `--local` with `--token`, `--scope`, or `--team`. Remove the cloud options to manage local schedules.";
    expect(result.exitCode).toBe(2);
    if (json) {
      expect(JSON.parse(result.stdout)).toEqual({
        status: 'error',
        reason: 'invalid_arguments',
        message,
        next: [
          {
            command: 'vercel schedules --local --help',
            when: 'Review the supported schedules options',
          },
        ],
      });
      expect(result.stderr).not.toContain(message);
    } else {
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(message);
    }
    expect(result.stdout + result.stderr).not.toContain(
      'explicit-selector-value'
    );
    expect(result.stdout + result.stderr).not.toContain(
      'invalid/ambient/token'
    );
    expect(result.stderr).not.toContain('auth config');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(await readFile(authPath, 'utf8')).toBe('{broken auth storage');
  });

  it.each(
    ['--local', '-L'].flatMap(local =>
      [
        { options: ['--namespace=--non-interactive=false'], json: true },
        { options: ['--', '--non-interactive=false'], json: true },
        { options: ['--namespace=--non-interactive'], json: false },
        { options: ['--', '--non-interactive'], json: false },
      ].map(context => ({ local, ...context }))
    )
  )('does not change selector-conflict output for values or terminated flags: $local $options', async ({
    local,
    options,
    json,
  }) => {
    await writeFile(authPath, '{broken auth storage');
    const result = await run(
      [
        'schedules',
        'list',
        local,
        '--token',
        'explicit-selector-value',
        ...options,
      ],
      { AI_AGENT: 'test-agent', FORCE_TTY: json ? '0' : '1' },
      false
    );
    expect(result.exitCode).toBe(2);
    if (json) {
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        next: [{ command: 'vercel schedules --local --help' }],
      });
      expect(result.stderr).not.toContain("Can't combine");
    } else {
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain("Can't combine `--local`");
    }
    expect(result.stdout + result.stderr).not.toContain(
      'explicit-selector-value'
    );
    expect(result.stderr).not.toContain('auth config');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(await readFile(authPath, 'utf8')).toBe('{broken auth storage');
  });

  it.each(
    [[], ['--local'], ['-L']].flatMap(local =>
      [
        ['--namespce', 'jobs', '--non-interactive'],
        ['--namespace', '--non-interactive'],
        ['--non-interactive', '--namespace'],
      ].map(options => ({ local, options }))
    )
  )('writes pre-auth JSON errors for $local $options', async ({
    local,
    options,
  }) => {
    await writeFile(authPath, '{broken auth storage');
    const result = await run(
      ['schedules', 'inspect', 'cleanup', ...local, ...options],
      { VERCEL_TOKEN: 'invalid/ambient/token' },
      false
    );
    expect(result.exitCode).toBe(2);
    const error = JSON.parse(result.stdout);
    expect(error).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      next: [
        {
          command: `vercel schedules${local.length ? ' --local' : ''} --help`,
        },
      ],
    });
    expect(error.message).toMatch(
      /--namespce|option requires argument: --namespace/
    );
    expect(result.stderr).not.toContain(error.message);
    expect(result.stderr).not.toContain('auth config');
    expect(result.stderr).not.toContain('No existing credentials');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(result.stdout).not.toContain('invalid/ambient/token');
    expect(await readFile(authPath, 'utf8')).toBe('{broken auth storage');
  });

  it.each([
    { options: ['--local'], local: true },
    { options: ['--namespace=--local'], local: false },
    { options: ['--namespace=--non-interactive=false'], local: false },
    { options: ['--local', '--', '--non-interactive=false'], local: true },
    { options: ['--', '--local', '--non-interactive=false'], local: false },
  ])('writes agent-implied JSON without interpreting values or terminated flags: $options', async ({
    options,
    local,
  }) => {
    await writeFile(authPath, '{broken auth storage');
    const result = await run(
      ['schedules', 'inspect', 'cleanup', '--namespce', 'jobs', ...options],
      { AI_AGENT: 'test-agent', VERCEL_TOKEN: 'invalid/ambient/token' },
      false
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      next: [{ command: `vercel schedules${local ? ' --local' : ''} --help` }],
    });
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(result.stderr).not.toContain('auth config');
    expect(await readFile(authPath, 'utf8')).toBe('{broken auth storage');
  });

  it.each([
    ['--non-interactive=false'],
    ['--non-interactive', 'false'],
  ])('honors an explicit human-mode override for agent syntax errors: %j', async (...options) => {
    await writeFile(authPath, '{broken auth storage');
    const result = await run(
      ['schedules', 'list', '--local', '--unknown', ...options],
      { AI_AGENT: 'test-agent', VERCEL_TOKEN: 'invalid/ambient/token' },
      false
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unknown or unexpected option: --unknown');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(result.stderr).not.toContain('auth config');
    expect(await readFile(authPath, 'utf8')).toBe('{broken auth storage');
  });

  it('does not enable non-interactive mode from option values or flags after --', async () => {
    await writeFile(authPath, '{broken auth storage');
    const result = await run(
      [
        'schedules',
        'list',
        '--unknown',
        '--namespace=--non-interactive',
        '--',
        '--non-interactive',
      ],
      { AI_AGENT: 'test-agent', FORCE_TTY: '1' },
      false
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unknown or unexpected option: --unknown');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(result.stderr).not.toContain('auth config');
  });

  it('reaches the local execution-history rejection without logging in', async () => {
    const result = await run([
      'schedules',
      'executions',
      'ls',
      'cleanup',
      '--local',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /execution.*(not supported|not available|unsupported)/i
    );
    expect(result.stderr).not.toContain('No existing credentials');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
  });

  it.each([
    ['schedules', 'inspect', '--local', '--help'],
    ['schedules', 'get', '-L', '--help'],
    ['help', 'schedules', 'inspect', '--local'],
  ])('prints local help on stdout with exit code 0: %j', async (...args) => {
    const result = await run(args);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('schedules inspect');
    expect(result.stderr).not.toContain('No existing credentials');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
  });

  it.each([
    ['schedules', 'list'],
    ['schedules', 'list', '--namespace=--local'],
    ['schedules', 'inspect', '--', '--local'],
  ])('still requires login for non-local invocations: %j', async (...args) => {
    const result = await run(args);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No existing credentials');
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
  });
});
