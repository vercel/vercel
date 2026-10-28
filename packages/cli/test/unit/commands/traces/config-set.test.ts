import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import {
  expectConfigTarget,
  headRule,
  mockConfigScope,
  useTracingConfig,
} from './config-fixture';

vi.mock('../../../../src/util/projects/link');

describe('vercel traces config set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.nonInteractive = false;
    mockConfigScope();
  });

  it.each([
    [
      'production',
      '1',
      '/api',
      headRule(0.01, { env: 'production', requestPath: '/api' }),
    ],
    ['preview', '100', undefined, headRule(1, { env: 'preview' })],
    ['any', '30', '/blog', headRule(0.3, { requestPath: '/blog' })],
    ['any', '5', undefined, headRule(0.05)],
  ])('enables tracing and sends %s %s %s as a head-sampling rule', async (env, rate, path, rule) => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv(
      'traces',
      'config',
      'set',
      env,
      rate,
      ...(path ? [path] : [])
    );
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([{ enabled: true, sampling: [rule] }]);
    expect(calls.requests.map(request => request.method)).toEqual([
      'GET',
      'PUT',
    ]);
    expectConfigTarget(calls.requests);
    expect(client.stderr.getFullOutput()).not.toContain('?');
  });

  it.each([
    ['25', '--environment', 'production'],
    ['-e', 'production', '25'],
    ['--environment=production', '25'],
  ])('reads the environment from the option in %s %s %s without a warning', async (...args) => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'set', ...args);
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      { enabled: true, sampling: [headRule(0.25, { env: 'production' })] },
    ]);
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('keeps the environment argument working with a deprecation warning', async () => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'set', 'production', '25');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      { enabled: true, sampling: [headRule(0.25, { env: 'production' })] },
    ]);
    expect(client.stderr.getFullOutput()).toContain(
      'The environment argument is deprecated. Use --environment.'
    );
  });

  it('rejects an environment given as an argument and as --environment', async () => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv(
      'traces',
      'config',
      'set',
      'production',
      '25',
      '--environment',
      'production'
    );
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use an environment argument with --environment."
    );
  });

  it('tracks --environment as an option', async () => {
    useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'set', '25', '--environment', 'preview');
    expect(await traces(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:config', value: 'config' },
      { key: 'subcommand:set', value: 'set' },
      { key: 'option:environment', value: 'preview' },
      { key: 'argument:rate', value: '[REDACTED]' },
    ]);
  });

  it('updates every duplicate key and reports the previous effective rate', async () => {
    const sampling = [
      headRule(0.1, { env: 'preview' }),
      headRule(0.5, { env: 'production' }),
      headRule(0.075, { requestPath: '/blog' }),
      headRule(1, { env: 'production' }),
    ];
    const calls = useTracingConfig({ enabled: true, sampling });
    client.nonInteractive = true;
    client.setArgv('traces', 'config', 'set', 'production', '25');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      {
        enabled: true,
        sampling: [
          sampling[0],
          headRule(0.25, { env: 'production' }),
          sampling[2],
          headRule(0.25, { env: 'production' }),
        ],
      },
    ]);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      previousSampleRate: 100,
      ruleCount: 4,
    });
  });

  it('keeps unmodeled fields on a replaced rule', async () => {
    const original = {
      ...headRule(0.1, { env: 'production' }),
      futureField: 'kept',
    };
    const calls = useTracingConfig({ enabled: true, sampling: [original] });
    client.setArgv('traces', 'config', 'set', 'production', '30');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      { enabled: true, sampling: [{ ...original, rate: 0.3 }] },
    ]);
  });

  it('preserves the effective catch-all when adding a rule to an enabled drain with empty sampling', async () => {
    const calls = useTracingConfig({ enabled: true, sampling: [] });
    client.setArgv('traces', 'config', 'set', 'production', '25', '/api');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      {
        enabled: true,
        sampling: [
          headRule(1),
          headRule(0.25, { env: 'production', requestPath: '/api' }),
        ],
      },
    ]);
  });

  it('preserves neighbouring fractional rates and persisted order when replacing a rule', async () => {
    const calls = useTracingConfig({
      enabled: true,
      sampling: [
        headRule(0.075, { env: 'production' }),
        headRule(0.125, { env: 'production', requestPath: '/api' }),
        headRule(0.005, { requestPath: '/blog' }),
      ],
    });
    client.setArgv('traces', 'config', 'set', 'production', '20', '/api');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      {
        enabled: true,
        sampling: [
          headRule(0.075, { env: 'production' }),
          headRule(0.2, { env: 'production', requestPath: '/api' }),
          headRule(0.005, { requestPath: '/blog' }),
        ],
      },
    ]);
    expect(client.stderr.getFullOutput()).toContain('was 13%');
    expect(client.stderr.getFullOutput()).toContain('3 of 10 rules');
  });

  it('appends a new rule without conflating any and production', async () => {
    const calls = useTracingConfig({
      enabled: true,
      sampling: [headRule(0.1, { requestPath: '/api' })],
    });
    client.setArgv('traces', 'config', 'set', 'production', '90', '/api');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies[0].sampling).toEqual([
      headRule(0.1, { requestPath: '/api' }),
      headRule(0.9, { env: 'production', requestPath: '/api' }),
    ]);
    expect(client.stderr.getFullOutput()).not.toContain('was ');
  });

  it('preserves saved sampling when re-enabling a disabled drain', async () => {
    const calls = useTracingConfig({
      enabled: false,
      sampling: [headRule(0.075, { env: 'production' })],
    });
    client.setArgv('traces', 'config', 'set', 'preview', '25');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      {
        enabled: true,
        sampling: [
          headRule(0.075, { env: 'production' }),
          headRule(0.25, { env: 'preview' }),
        ],
      },
    ]);
  });

  it('replaces the effective 100% default of an enabled drain with empty sampling', async () => {
    const calls = useTracingConfig({ enabled: true, sampling: [] });
    client.setArgv('traces', 'config', 'set', 'any', '25');
    expect(await traces(client)).toBe(0);
    expect(calls.bodies).toEqual([
      { enabled: true, sampling: [headRule(0.25)] },
    ]);
    expect(client.stderr.getFullOutput()).toContain('was 100%');
  });

  describe('the ten-rule limit', () => {
    const sampling = Array.from({ length: 10 }, (_, index) =>
      headRule(0.5, { requestPath: `/route-${index}` })
    );
    it('refuses an eleventh rule without writing', async () => {
      const calls = useTracingConfig({ enabled: true, sampling });
      client.setArgv('traces', 'config', 'set', 'any', '25', '/new-route');
      expect(await traces(client)).toBe(2);
      expect(calls.bodies).toEqual([]);
      expect(client.stderr.getFullOutput()).toContain('traces config remove');
    });
    it('replaces an existing rule when full', async () => {
      const calls = useTracingConfig({ enabled: true, sampling });
      client.setArgv('traces', 'config', 'set', 'any', '25', '/route-3');
      expect(await traces(client)).toBe(0);
      expect(calls.bodies[0].sampling).toHaveLength(10);
      expect(calls.bodies[0].sampling?.[3]).toEqual(
        headRule(0.25, { requestPath: '/route-3' })
      );
    });
  });

  describe('validation', () => {
    it.each([
      ['staging', '25'],
      ['production', '0'],
      ['production', '101'],
      ['production', '2.5'],
      ['production', 'abc'],
      ['production', '-5'],
      ['production', '25', ''],
    ])('rejects invalid arguments %j before calling the API', async (...args) => {
      const calls = useTracingConfig({ enabled: false, sampling: [] });
      client.setArgv('traces', 'config', 'set', ...args);
      expect(await traces(client)).toBe(2);
      expect(calls.requests).toEqual([]);
    });
    it.each([
      ['production'],
      ['production', '25', '/api', '/extra'],
    ])('exits 2 for invalid argument count %j', async (...args) => {
      const calls = useTracingConfig({ enabled: false, sampling: [] });
      client.setArgv('traces', 'config', 'set', ...args);
      expect(await traces(client)).toBe(2);
      expect(calls.requests).toEqual([]);
    });
  });

  it.each([
    false,
    true,
  ])('preserves JSON output in non-interactive=%s mode', async nonInteractive => {
    useTracingConfig({
      enabled: true,
      sampling: [headRule(0.1, { env: 'production' })],
    });
    client.nonInteractive = nonInteractive;
    client.setArgv('traces', 'config', 'set', 'production', '60', '--json');
    expect(await traces(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    const rule = {
      environment: 'production',
      requestPath: null,
      sampleRate: 60,
    };
    if (nonInteractive) {
      expect(payload).toMatchObject({
        status: 'ok',
        projectId: 'prj_test',
        projectName: 'traces-project',
        rule,
        previousSampleRate: 10,
        ruleCount: 1,
        ruleLimit: 10,
      });
      expect(payload.next[0].command).toContain('traces config ls');
    } else {
      expect(payload).toEqual(rule);
    }
  });

  it.each([
    [403, 'forbidden', 'You cannot change observability settings'],
    [409, 'tracing_config_busy', 'Tracing configuration is busy'],
    [503, 'tracing_config_unavailable', 'Tracing configuration is unavailable'],
  ])('surfaces a PUT failure with status %s', async (status, code, message) => {
    useTracingConfig(
      { enabled: false, sampling: [] },
      { status, code, message }
    );
    client.setArgv('traces', 'config', 'set', 'production', '25');
    expect(await traces(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(message);
  });

  it('tracks the subcommand and redacts the rate and path', async () => {
    useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'set', 'production', '25', '/api');
    expect(await traces(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:config', value: 'config' },
      { key: 'subcommand:set', value: 'set' },
      { key: 'argument:environment', value: 'production' },
      { key: 'argument:rate', value: '[REDACTED]' },
      { key: 'argument:requestPath', value: '[REDACTED]' },
    ]);
  });

  it('redacts an invalid environment word', async () => {
    client.setArgv('traces', 'config', 'set', '25', '--environment', 'staging');
    expect(await traces(client)).toBe(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:config', value: 'config' },
      { key: 'subcommand:set', value: 'set' },
      { key: 'option:environment', value: '[REDACTED]' },
      { key: 'argument:rate', value: '[REDACTED]' },
    ]);
  });

  it.each([
    ['25'],
    ['25', '/api'],
    ['staging', '25'],
  ])('reports a missing --environment for %j', async (...args) => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'set', ...args);
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't set a sampling rule without --environment."
    );
  });

  it('reports a missing --environment as action_required in non-interactive mode', async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as () => never);
    useTracingConfig({ enabled: false, sampling: [] });
    client.nonInteractive = true;
    client.setArgv('traces', 'config', 'set', '25', '/api');
    await expect(traces(client)).rejects.toThrow('exit');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'action_required',
      reason: 'missing_environment',
    });
    vi.restoreAllMocks();
  });

  it('reports an environment given both ways as JSON in non-interactive mode', async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as () => never);
    useTracingConfig({ enabled: false, sampling: [] });
    client.nonInteractive = true;
    client.setArgv(
      'traces',
      'config',
      'set',
      'production',
      '25',
      '--environment',
      'preview'
    );
    await expect(traces(client)).rejects.toThrow('exit');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    vi.restoreAllMocks();
  });
});
