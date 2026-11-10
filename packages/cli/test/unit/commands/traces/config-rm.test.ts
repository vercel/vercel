import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import {
  expectConfigTarget,
  headRule,
  mockConfigScope,
  useTracingConfig,
} from './config-fixture';

vi.mock('../../../../src/util/projects/link');

const sampling = [
  headRule(0.1, { env: 'production' }),
  headRule(0.2, { env: 'production', requestPath: '/api' }),
  headRule(0.3, { env: 'preview' }),
  headRule(0.4),
  headRule(0.005, { requestPath: '/blog' }),
];

async function runAnswering(answer: 'y' | 'n'): Promise<number> {
  const result = traces(client);
  await expect(client.stderr).toOutput('will be removed from');
  client.stdin.write(`${answer}\n`);
  return result;
}

describe('vercel traces config rm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.nonInteractive = false;
    mockConfigScope();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { args: ['production', '/api'], kept: [sampling[0], ...sampling.slice(2)] },
    { args: ['production'], kept: sampling.slice(2) },
    { args: ['production', '--default'], kept: sampling.slice(1) },
    { args: ['any'], kept: sampling.slice(0, 3) },
  ])('removes only the selected rules for $args, preserving order and fractional rates', async ({
    args,
    kept,
  }) => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', ...args);
    expect(await runAnswering('y')).toBe(0);
    expect(calls.bodies).toEqual([{ enabled: true, sampling: kept }]);
    expectConfigTarget(calls.requests);
  });

  it.each([
    ['--environment', 'production', '/api'],
    ['-e', 'production', '/api'],
    ['/api', '--environment', 'production'],
  ])('reads the environment from the option in %s %s %s without a warning', async (...args) => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', ...args);
    expect(await runAnswering('y')).toBe(0);
    expect(calls.bodies).toEqual([
      { enabled: true, sampling: [sampling[0], ...sampling.slice(2)] },
    ]);
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('keeps the environment argument working with a deprecation warning', async () => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', 'production', '/api');
    expect(await runAnswering('y')).toBe(0);
    expect(calls.bodies).toEqual([
      { enabled: true, sampling: [sampling[0], ...sampling.slice(2)] },
    ]);
    expect(client.stderr.getFullOutput()).toContain(
      'The environment argument is deprecated. Use --environment.'
    );
  });

  it.each([
    ['/api'],
    ['/api', '--default'],
  ])('reports a missing --environment for %j', async (...args) => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', ...args);
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't remove sampling rules without --environment."
    );
  });

  it('rejects an environment given as an argument and as --environment', async () => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv(
      'traces',
      'config',
      'rm',
      'production',
      '--environment',
      'production'
    );
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use an environment argument with --environment."
    );
  });

  it.each([
    'rm',
    'remove',
    'delete',
  ])('disables tracing when %s removes the final rule', async alias => {
    const calls = useTracingConfig({
      enabled: true,
      sampling: [headRule(0.1, { env: 'production' })],
    });
    client.setArgv('traces', 'config', alias, 'production');
    expect(await runAnswering('y')).toBe(0);
    expect(calls.bodies).toEqual([{ enabled: false }]);
    expect(calls.getConfig()).toEqual({ enabled: false, sampling: [] });
    expect(client.stderr.getFullOutput()).toContain('0 of 10 rules');
    expect(client.stderr.getFullOutput()).toContain(
      'Removing the final rule disables tracing'
    );
    expect(client.stderr.getFullOutput()).toContain('Tracing is disabled.');
  });

  it('lists no rules after the final rule is removed', async () => {
    const calls = useTracingConfig({
      enabled: true,
      sampling: [headRule(0.1)],
    });
    client.setArgv('traces', 'config', 'rm', 'any');
    expect(await runAnswering('y')).toBe(0);
    const stderrOffset = client.stderr.getFullOutput().length;
    client.setArgv('traces', 'config', 'ls');
    expect(await traces(client)).toBe(0);
    const emptyOutput = client.stderr.getFullOutput().slice(stderrOffset);
    expect(emptyOutput).toContain(
      'No trace sampling rules for traces-project.'
    );
    expect(emptyOutput).not.toContain('Trace sampling rules for');
    client.nonInteractive = true;
    client.setArgv('traces', 'config', 'ls');
    expect(await traces(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      rules: [],
      enabled: false,
    });
    expect(calls.getConfig().enabled).toBe(false);
  });

  it('disables an enabled drain with implicit 100% sampling when removing any', async () => {
    const calls = useTracingConfig({ enabled: true, sampling: [] });
    client.setArgv('traces', 'config', 'rm', 'any');
    expect(await runAnswering('y')).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('100%');
    expect(calls.bodies).toEqual([{ enabled: false }]);
  });

  it('updates only the scoped internal drain, never the project tracing field', async () => {
    mockConfigScope({
      projectId: 'prj_other',
      projectName: 'other-app',
      teamId: 'team_flag',
      teamSlug: 'flag-team',
    });
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv(
      'traces',
      'config',
      'rm',
      'production',
      '--scope',
      'flag-team',
      '--project',
      'other-app'
    );
    expect(await runAnswering('y')).toBe(0);
    expectConfigTarget(calls.requests, 'prj_other', 'team_flag');
    expect(calls.requests.map(request => request.method)).toEqual([
      'GET',
      'PUT',
    ]);
    expect(calls.bodies).toEqual([
      { enabled: true, sampling: sampling.slice(2) },
    ]);
  });

  it('refuses to remove saved rules from a disabled drain rather than re-enabling it', async () => {
    const calls = useTracingConfig({ enabled: false, sampling });
    client.setArgv('traces', 'config', 'rm', 'production');
    expect(await traces(client)).toBe(2);
    expect(calls.bodies).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain('Tracing is disabled');
  });

  it.each([
    { args: ['preview'], rules: [headRule(0.1, { env: 'production' })] },
    {
      args: ['production', '/other'],
      rules: [headRule(0.1, { env: 'production', requestPath: '/api' })],
    },
    { args: ['production'], rules: [] },
  ])('does not write when no rule matches $args', async ({ args, rules }) => {
    const calls = useTracingConfig({
      enabled: rules.length > 0,
      sampling: rules,
    });
    client.setArgv('traces', 'config', 'rm', ...args);
    expect(await traces(client)).toBe(1);
    expect(calls.bodies).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain('No trace sampling rule');
  });

  it('lists every rule at risk before confirming', async () => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', 'production');
    expect(await runAnswering('y')).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('(all paths)');
    expect(stderr).toContain('/api');
    expect(stderr).toContain('10%');
    expect(stderr).toContain('20%');
    expect(calls.bodies[0].sampling).toHaveLength(3);
  });

  it('does not write when confirmation is declined', async () => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', 'production');
    expect(await runAnswering('n')).toBe(0);
    expect(calls.bodies).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it.each(['--yes', '-y'])('does not accept %s as confirmation', async flag => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', 'production', flag);
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
  });

  it.each([
    'agent',
    'non-TTY',
  ])('refuses a %s session that cannot confirm', async mode => {
    const calls = useTracingConfig({ enabled: true, sampling });
    if (mode === 'agent') client.isAgent = true;
    else client.stdin.isTTY = false;
    client.setArgv('traces', 'config', 'rm', 'production');
    expect(await traces(client)).toBe(1);
    expect(calls.bodies).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain('cannot prompt');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  function spyExit() {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as () => never);
  }

  it('reports every rule at risk and requires human confirmation in non-interactive mode', async () => {
    spyExit();
    const calls = useTracingConfig({ enabled: true, sampling });
    client.nonInteractive = true;
    client.setArgv('traces', 'config', 'rm', '--environment', 'production');
    await expect(traces(client)).rejects.toThrow('exit');
    expect(calls.bodies).toEqual([]);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'confirmation_required',
      userActionRequired: true,
    });
    expect(payload.message).toContain('production (all paths) 10%');
    expect(payload.message).toContain('production /api 20%');
    expect(payload.next[0].command).toContain(
      'traces config remove --environment production'
    );
    expect(payload.next[0].command).not.toContain('--yes');
  });

  it('preserves --default in the suggested confirmation command', async () => {
    spyExit();
    useTracingConfig({ enabled: true, sampling });
    client.nonInteractive = true;
    client.setArgv(
      'traces',
      'config',
      'rm',
      '--environment',
      'production',
      '--default'
    );
    await expect(traces(client)).rejects.toThrow('exit');
    expect(JSON.parse(client.stdout.getFullOutput()).next[0].command).toContain(
      'traces config remove --environment production --default'
    );
  });

  it('quotes shell metacharacters in the suggested confirmation command', async () => {
    spyExit();
    useTracingConfig({
      enabled: true,
      sampling: [
        headRule(0.1, {
          env: 'production',
          requestPath: '/api; touch /tmp/pwn',
        }),
      ],
    });
    client.nonInteractive = true;
    client.setArgv(
      'traces',
      'config',
      'rm',
      '/api; touch /tmp/pwn',
      '--environment',
      'production'
    );
    await expect(traces(client)).rejects.toThrow('exit');
    expect(JSON.parse(client.stdout.getFullOutput()).next[0].command).toContain(
      "traces config remove '/api; touch /tmp/pwn' --environment production"
    );
  });

  it('reports not_found ahead of confirmation_required when nothing matches', async () => {
    spyExit();
    const calls = useTracingConfig({
      enabled: true,
      sampling: [headRule(0.1, { env: 'production' })],
    });
    client.nonInteractive = true;
    client.setArgv('traces', 'config', 'rm', 'preview');
    await expect(traces(client)).rejects.toThrow('exit');
    expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe('not_found');
    expect(calls.bodies).toEqual([]);
  });

  it.each([
    ['staging'],
    ['production', '/api', '--default'],
    ['production', ''],
  ])('rejects invalid input %j before calling the API', async (...args) => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', ...args);
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
  });
  it.each([
    [],
    ['production', '/api', '/extra'],
  ])('exits 2 for invalid argument count %j', async (...args) => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', ...args);
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
  });

  it('keeps removed-rule JSON on stdout and the confirmation preview on stderr', async () => {
    useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', 'production', '--json');
    expect(await runAnswering('y')).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual([
      { environment: 'production', requestPath: null, sampleRate: 10 },
      { environment: 'production', requestPath: '/api', sampleRate: 20 },
    ]);
    expect(client.stderr.getFullOutput()).toContain('/api');
    expect(client.stderr.getFullOutput()).toContain('20%');
    expect(client.stdout.getFullOutput()).not.toContain('Removed');
  });

  it('surfaces a forbidden PUT without reporting success', async () => {
    useTracingConfig(
      { enabled: true, sampling },
      {
        status: 403,
        code: 'forbidden',
        message: 'You cannot change observability settings',
      }
    );
    client.setArgv('traces', 'config', 'rm', 'production');
    expect(await runAnswering('y')).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You cannot change observability settings'
    );
    expect(client.stderr.getFullOutput()).not.toContain('Removed');
  });

  it('tracks the subcommand and redacts the path', async () => {
    useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'remove', 'production', '/api');
    expect(await runAnswering('y')).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:config', value: 'config' },
      { key: 'subcommand:remove', value: 'remove' },
      { key: 'argument:environment', value: 'production' },
      { key: 'argument:requestPath', value: '[REDACTED]' },
    ]);
  });
  it('tracks --default', async () => {
    useTracingConfig({ enabled: true, sampling });
    client.setArgv('traces', 'config', 'rm', 'production', '--default');
    expect(await runAnswering('y')).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:config', value: 'config' },
      { key: 'subcommand:remove', value: 'rm' },
      { key: 'argument:environment', value: 'production' },
      { key: 'flag:default', value: 'TRUE' },
    ]);
  });

  it.each([
    ['remove', false],
    ['rm', false],
    ['delete', true],
  ])('runs as %s (deprecated: %s)', async (name, deprecated) => {
    useTracingConfig({ enabled: true, sampling });
    client.setArgv(
      'traces',
      'config',
      name,
      '/api',
      '--environment',
      'production'
    );
    expect(await runAnswering('y')).toBe(0);
    const warning =
      '`vercel traces config delete` is deprecated. Use `vercel traces config remove`.';
    if (deprecated) {
      expect(client.stderr.getFullOutput()).toContain(warning);
    } else {
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    }
  });
});
