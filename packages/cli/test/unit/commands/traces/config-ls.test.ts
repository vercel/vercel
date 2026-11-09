import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import * as linkModule from '../../../../src/util/projects/link';
import {
  configPath,
  expectConfigTarget,
  headRule,
  mockConfigScope,
  useTracingConfig,
} from './config-fixture';

vi.mock('../../../../src/util/projects/link');

const sampling = [
  headRule(0.01, { env: 'preview', requestPath: '/__tracing_repro_unused' }),
  headRule(0.25, { env: 'production' }),
  headRule(1),
];
const rows = [
  {
    environment: 'preview',
    requestPath: '/__tracing_repro_unused',
    sampleRate: 1,
  },
  { environment: 'production', requestPath: null, sampleRate: 25 },
  { environment: 'any', requestPath: null, sampleRate: 100 },
];

describe('vercel traces config ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.nonInteractive = false;
    mockConfigScope();
  });

  it.each([
    { mode: 'interactive', nonInteractive: false, flags: [] },
    { mode: 'JSON', nonInteractive: false, flags: ['--json'] },
    { mode: 'format JSON', nonInteractive: false, flags: ['--format', 'json'] },
    { mode: 'non-interactive', nonInteractive: true, flags: [] },
    { mode: 'non-interactive JSON', nonInteractive: true, flags: ['--json'] },
  ])('lists the internal drain sampling in $mode mode', async ({
    nonInteractive,
    flags,
  }) => {
    const calls = useTracingConfig({ enabled: true, sampling });
    client.nonInteractive = nonInteractive;
    client.setArgv('traces', 'config', 'ls', ...flags);
    expect(await traces(client)).toBe(0);
    expect(calls.requests).toHaveLength(1);
    expectConfigTarget(calls.requests);
    expect(calls.bodies).toEqual([]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('No trace sampling rules');
    if (nonInteractive || flags.length) {
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(nonInteractive ? payload.rules : payload).toEqual(rows);
      if (nonInteractive) {
        expect(payload).toMatchObject({
          status: 'ok',
          projectId: 'prj_test',
          projectName: 'traces-project',
          message: 'Listed 3 of 10 rules.',
        });
        expect(payload.next[0].command).toContain('traces config set');
      }
    } else {
      expect(client.stdout.getFullOutput()).toBe('');
      expect(stderr).toContain('3 of 10 rules');
      expect(stderr).toMatch(/preview\s+\/__tracing_repro_unused\s+1%/);
      expect(stderr).toMatch(/production\s+\(all paths\)\s+25%/);
      expect(stderr).toMatch(/any\s+\(all paths\)\s+100%/);
      expect(stderr.indexOf('preview')).toBeLessThan(
        stderr.indexOf('production')
      );
      expect(stderr.indexOf('production')).toBeLessThan(stderr.indexOf('any'));
    }
  });

  it.each([
    false,
    true,
  ])('shows the effective 100% default for an enabled drain in JSON=%s mode', async json => {
    useTracingConfig({ enabled: true, sampling: [] });
    client.setArgv('traces', 'config', 'ls', ...(json ? ['--json'] : []));
    expect(await traces(client)).toBe(0);
    if (json) {
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual([
        { environment: 'any', requestPath: null, sampleRate: 100 },
      ]);
    } else {
      expect(client.stderr.getFullOutput()).toContain('100%');
      expect(client.stderr.getFullOutput()).toContain('1 of 10 rules');
    }
  });

  it.each([
    false,
    true,
  ])('reports an absent drain as empty in non-interactive=%s mode', async nonInteractive => {
    useTracingConfig({ enabled: false, sampling: [] });
    client.nonInteractive = nonInteractive;
    client.setArgv('traces', 'config', 'ls');
    expect(await traces(client)).toBe(0);
    if (nonInteractive) {
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        rules: [],
        enabled: false,
        message: 'No trace sampling rules for traces-project.',
      });
    } else {
      expect(client.stderr.getFullOutput()).toContain(
        'No trace sampling rules for traces-project.'
      );
      expect(client.stderr.getFullOutput()).toContain('traces config set');
      expect(client.stderr.getFullOutput()).not.toContain(
        'Trace sampling rules for'
      );
    }
  });

  it.each([
    { savedRules: [] },
    { savedRules: sampling },
  ])('shows disabled tracing before the human empty state or saved-rule table', async ({
    savedRules,
  }) => {
    useTracingConfig({ enabled: false, sampling: savedRules });
    client.setArgv('traces', 'config', 'ls');
    expect(await traces(client)).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Tracing is disabled for traces-project.');
    const result = savedRules.length
      ? 'Trace sampling rules for'
      : 'No trace sampling rules for';
    expect(stderr.indexOf('Tracing is disabled')).toBeLessThan(
      stderr.indexOf(result)
    );
  });

  it('lists saved sampling for a disabled drain without enabling it', async () => {
    const calls = useTracingConfig({ enabled: false, sampling });
    client.setArgv('traces', 'config', 'ls', '--json');
    expect(await traces(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(rows);
    expect(calls.bodies).toEqual([]);
  });

  it('does not read the derived project tracing config containing external and legacy rules', async () => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    let projectReads = 0;
    client.scenario.get('/v9/projects/:idOrName', (_, res) => {
      projectReads++;
      res.json({
        tracing: {
          samplingRules: [{ rate: 1 }, { rate: 0.5, destination: 'external' }],
        },
      });
    });
    client.setArgv('traces', 'config', 'ls', '--json');
    expect(await traces(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual([]);
    expect(projectReads).toBe(0);
    expectConfigTarget(calls.requests);
  });

  it('sets, lists, updates, and lists the same explicit team and project', async () => {
    mockConfigScope({
      projectId: 'prj_other',
      projectName: 'other-app',
      teamId: 'team_flag',
      teamSlug: 'flag-team',
    });
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.nonInteractive = true;
    async function run(...args: string[]) {
      const offset = client.stdout.getFullOutput().length;
      client.setArgv(
        'traces',
        'config',
        ...args,
        '--scope',
        'flag-team',
        '--project',
        'other-app'
      );
      expect(await traces(client)).toBe(0);
      return JSON.parse(client.stdout.getFullOutput().slice(offset));
    }
    const created = await run('set', 'preview', '1', '/__tracing_repro_unused');
    expect(created.previousSampleRate).toBeNull();
    expect(calls.getConfig()).toEqual({
      enabled: true,
      sampling: [
        headRule(0.01, {
          env: 'preview',
          requestPath: '/__tracing_repro_unused',
        }),
      ],
    });
    expect((await run('ls')).rules).toEqual([created.rule]);
    const updated = await run(
      'set',
      'preview',
      '25',
      '/__tracing_repro_unused'
    );
    expect(updated.previousSampleRate).toBe(1);
    expect(updated.ruleCount).toBe(1);
    expect((await run('ls')).rules).toEqual([updated.rule]);
    expect(calls.requests).toHaveLength(6);
    expectConfigTarget(calls.requests, 'prj_other', 'team_flag');
  });

  it('resolves --scope and --project to ids before querying the drain', async () => {
    mockConfigScope({
      projectId: 'prj_other',
      projectName: 'other-app',
      teamId: 'team_flag',
      teamSlug: 'flag-team',
    });
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv(
      'traces',
      'config',
      'ls',
      '--scope',
      'flag-team',
      '--project',
      'other-app'
    );
    expect(await traces(client)).toBe(0);
    expectConfigTarget(calls.requests, 'prj_other', 'team_flag');
    expect(vi.mocked(linkModule.getLinkedProject)).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        projectName: 'other-app',
        projectNameIsExplicit: true,
        scopeIsExplicit: true,
      })
    );
  });

  it('refuses a --scope that disagrees with the linked project', async () => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'ls', '--scope', 'other-team');
    expect(await traces(client)).toBe(2);
    expect(calls.requests).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain('--project');
  });

  it('reports an unresolved project before requesting tracing', async () => {
    vi.mocked(linkModule.getLinkedProject).mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'ls');
    expect(await traces(client)).toBe(1);
    expect(calls.requests).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain('vercel link');
  });

  it('accepts list as an alias', async () => {
    useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'list', '--json');
    expect(await traces(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual([]);
  });

  it.each([
    ['--format', 'yaml'],
    ['unexpected'],
  ])('rejects invalid input %j without an API request', async (...args) => {
    const calls = useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv('traces', 'config', 'ls', ...args);
    expect(await traces(client)).not.toBe(0);
    expect(calls.requests).toEqual([]);
  });

  describe('API errors', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it.each([
      [403, 'forbidden', 'permission_denied'],
      [404, 'not_found', 'not_found'],
      [500, 'internal', 'api_error'],
    ])('reports GET status %s in non-interactive JSON', async (status, code, reason) => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);
      client.scenario.get(configPath, (_, res) =>
        res
          .status(status)
          .json({ error: { code, message: 'Cannot read tracing settings' } })
      );
      client.nonInteractive = true;
      client.setArgv('traces', 'config', 'ls');
      await expect(traces(client)).rejects.toThrow('exit');
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason,
      });
    });
    it('surfaces permission errors in human output', async () => {
      client.scenario.get(configPath, (_, res) =>
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Cannot read tracing settings',
          },
        })
      );
      client.setArgv('traces', 'config', 'ls');
      expect(await traces(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Cannot read tracing settings'
      );
    });
  });

  describe('routing', () => {
    it('prints group help and exits 2 for a bare traces config', async () => {
      client.setArgv('traces', 'config');
      expect(await traces(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain('traces config');
    });
    it.each([
      'config',
      'config ls',
      'config set',
      'config rm',
    ])('prints help for traces %s', async command => {
      client.setArgv('traces', ...command.split(' '), '--help');
      expect(await traces(client)).toBe(0);
      expect(linkModule.getLinkedProject).not.toHaveBeenCalled();
    });
  });

  it('tracks the subcommand and flags', async () => {
    useTracingConfig({ enabled: false, sampling: [] });
    client.setArgv(
      'traces',
      'config',
      'list',
      '--json',
      '--project',
      'traces-project'
    );
    expect(await traces(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:config', value: 'config' },
      { key: 'subcommand:ls', value: 'list' },
      { key: 'flag:json', value: 'TRUE' },
      { key: 'option:project', value: '[REDACTED]' },
    ]);
  });
});
