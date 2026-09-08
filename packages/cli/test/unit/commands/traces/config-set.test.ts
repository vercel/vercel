import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import * as linkModule from '../../../../src/util/projects/link';
import type { ProjectTracing } from '@vercel-internals/types';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_test',
      name: 'traces-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  });
}

type PatchCalls = {
  bodies: Array<Record<string, unknown>>;
};

/**
 * Registers the read-modify-write pair for a project with the given `tracing`
 * value and records every PATCH body.
 */
function useTracingProject(tracing: ProjectTracing | null | undefined) {
  const calls: PatchCalls = { bodies: [] };
  const project = {
    id: 'prj_test',
    name: 'traces-project',
    accountId: 'team_dummy',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    ...(tracing === undefined ? {} : { tracing }),
  };
  client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
    res.json(project);
  });
  client.scenario.patch('/v9/projects/:idOrName', (req, res) => {
    calls.bodies.push(req.body);
    res.json({ ...project, ...req.body });
  });
  return calls;
}

/** The `tracing` object from the single PATCH the command should have made. */
function patchedTracing(calls: PatchCalls): ProjectTracing {
  expect(calls.bodies).toHaveLength(1);
  return calls.bodies[0].tracing as ProjectTracing;
}

describe('vercel traces config set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.nonInteractive = false;
    mockLinkedProject();
  });

  it('creates the first rule on a project that has never used tracing', async () => {
    const calls = useTracingProject(null);

    client.setArgv('traces', 'config', 'set', 'production', '25');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(patchedTracing(calls)).toEqual({
      samplingRules: [{ rate: 0.25, env: 'production' }],
    });
  });

  it('does not invent `domains` or `ignorePaths` when `tracing` is absent', async () => {
    const calls = useTracingProject(undefined);

    client.setArgv('traces', 'config', 'set', 'preview', '50');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(Object.keys(patchedTracing(calls))).toEqual(['samplingRules']);
  });

  it('carries `domains` and `ignorePaths` through untouched', async () => {
    const calls = useTracingProject({
      domains: 'drain.example.com,other.example.com',
      ignorePaths: ['/health', '/metrics'],
      samplingRules: [{ rate: 0.1, env: 'production' }],
    });

    client.setArgv('traces', 'config', 'set', 'preview', '100', '/api');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(patchedTracing(calls)).toEqual({
      domains: 'drain.example.com,other.example.com',
      ignorePaths: ['/health', '/metrics'],
      samplingRules: [
        { rate: 0.1, env: 'production' },
        { rate: 1, env: 'preview', requestPath: '/api' },
      ],
    });
  });

  /**
   * The API accepts any rate from 0 to 1, and the command line only spells whole
   * percentages, so a rule the CLI cannot express has to survive an edit to a
   * different rule: the write sends back the object the API returned, rather
   * than one rebuilt from what the table showed.
   */
  it('sends a neighbouring rate the CLI cannot express back unchanged', async () => {
    const calls = useTracingProject({
      samplingRules: [
        { rate: 0.075, env: 'production' },
        { rate: 0.005, requestPath: '/blog' },
      ],
    });

    client.setArgv('traces', 'config', 'set', 'preview', '50');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(patchedTracing(calls).samplingRules).toEqual([
      { rate: 0.075, env: 'production' },
      { rate: 0.005, requestPath: '/blog' },
      { rate: 0.5, env: 'preview' },
    ]);
  });

  it('changes only the rate of the rule it replaces', async () => {
    const calls = useTracingProject({
      samplingRules: [
        { rate: 0.075, env: 'production' },
        { rate: 0.125, env: 'production', requestPath: '/api' },
      ],
    });

    client.setArgv('traces', 'config', 'set', 'production', '20', '/api');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(patchedTracing(calls).samplingRules).toEqual([
      { rate: 0.075, env: 'production' },
      { rate: 0.2, env: 'production', requestPath: '/api' },
    ]);
  });

  /**
   * A rule the API sent with fields the CLI does not model is still that rule
   * after its rate changes.
   */
  it('keeps fields it does not model on a replaced rule', async () => {
    const calls = useTracingProject({
      samplingRules: [
        {
          rate: 0.1,
          env: 'production',
          requestPath: '/api',
          unknownField: 'kept',
        } as never,
      ],
    });

    client.setArgv('traces', 'config', 'set', 'production', '30', '/api');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(patchedTracing(calls).samplingRules).toEqual([
      {
        rate: 0.3,
        env: 'production',
        requestPath: '/api',
        unknownField: 'kept',
      },
    ]);
  });

  it('replaces the rule that shares its environment and path', async () => {
    const calls = useTracingProject({
      samplingRules: [
        { rate: 0.1, env: 'production' },
        { rate: 0.1, env: 'production', requestPath: '/api' },
      ],
    });

    client.setArgv('traces', 'config', 'set', 'production', '75', '/api');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(patchedTracing(calls).samplingRules).toEqual([
      { rate: 0.1, env: 'production' },
      { rate: 0.75, env: 'production', requestPath: '/api' },
    ]);
  });

  it('reports the old rate and the new rate with the rule count', async () => {
    useTracingProject({
      samplingRules: [{ rate: 0.1, env: 'production' }],
    });

    client.setArgv('traces', 'config', 'set', 'production', '75');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('75%');
    expect(stderr).toContain('was 10%');
    expect(stderr).toContain('1 of 10 rules');
  });

  it('omits the old rate when the rule is new', async () => {
    useTracingProject({ samplingRules: [] });

    client.setArgv('traces', 'config', 'set', 'production', '75');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('75%');
    expect(stderr).not.toContain('was ');
    expect(stderr).toContain('1 of 10 rules');
  });

  it('labels a rule with no path as covering all paths', async () => {
    useTracingProject({ samplingRules: [] });

    client.setArgv('traces', 'config', 'set', 'any', '5');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('(all paths)');
  });

  it('never prompts', async () => {
    useTracingProject({ samplingRules: [] });

    client.setArgv('traces', 'config', 'set', 'production', '25');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('?');
  });

  describe('rate conversion', () => {
    it('sends 1 as 0.01', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'production', '1');
      await traces(client);

      expect(patchedTracing(calls).samplingRules).toEqual([
        { rate: 0.01, env: 'production' },
      ]);
    });

    it('sends 100 as 1', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'production', '100');
      await traces(client);

      expect(patchedTracing(calls).samplingRules).toEqual([
        { rate: 1, env: 'production' },
      ]);
    });
  });

  describe('the `any` environment', () => {
    it('writes a rule with no `env` key', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'any', '30', '/blog');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      const [rule] = patchedTracing(calls).samplingRules ?? [];
      expect(rule).toEqual({ rate: 0.3, requestPath: '/blog' });
      expect(rule).not.toHaveProperty('env');
    });

    it('is a different rule from the same path under `production`', async () => {
      const calls = useTracingProject({
        samplingRules: [{ rate: 0.1, requestPath: '/api' }],
      });

      client.setArgv('traces', 'config', 'set', 'production', '90', '/api');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(patchedTracing(calls).samplingRules).toEqual([
        { rate: 0.1, requestPath: '/api' },
        { rate: 0.9, env: 'production', requestPath: '/api' },
      ]);
    });
  });

  describe('validation', () => {
    it('rejects an unknown environment word before calling the API', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'staging', '25');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('any, preview, production');
      expect(stderr).toContain('staging');
    });

    it.each([
      ['0', 'a rate of zero'],
      ['101', 'a rate above 100'],
      ['2.5', 'a fractional rate'],
      ['abc', 'a non-numeric rate'],
    ])('rejects %s (%s) before calling the API', async rate => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'production', rate);
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        'whole number from 1 to 100'
      );
    });

    // A leading `-` reads as a flag to the argument parser, so a negative rate
    // fails as an unknown option rather than reaching the range check.
    it('rejects a negative rate before calling the API', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'production', '-5');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
    });

    it('rejects an empty path prefix', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'production', '25', '');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
    });

    it('prints help and exits 2 when arguments are missing', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'production');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('traces config set');
    });

    // Arg-count problems print usage, so they exit 2 like `ls` does, while a
    // bad argument value exits 1.
    it('exits 2 on too many arguments', async () => {
      const calls = useTracingProject({ samplingRules: [] });

      client.setArgv(
        'traces',
        'config',
        'set',
        'production',
        '25',
        '/api',
        '/extra'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('Too many arguments');
    });
  });

  describe('the ten-rule limit', () => {
    const tenRules = Array.from({ length: 10 }, (_unused, index) => ({
      rate: 0.5,
      requestPath: `/route-${index}`,
    }));

    it('refuses an eleventh rule and makes no write', async () => {
      const calls = useTracingProject({ samplingRules: tenRules });

      client.setArgv('traces', 'config', 'set', 'any', '25', '/new-route');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('10');
      expect(stderr).toContain('traces config rm');
    });

    it('still replaces an existing rule when the project is full', async () => {
      const calls = useTracingProject({ samplingRules: tenRules });

      client.setArgv('traces', 'config', 'set', 'any', '25', '/route-3');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(patchedTracing(calls).samplingRules).toHaveLength(10);
    });
  });

  describe('--json', () => {
    it('prints the changed rule', async () => {
      useTracingProject({ samplingRules: [] });

      client.setArgv(
        'traces',
        'config',
        'set',
        'preview',
        '40',
        '/api',
        '--json'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        environment: 'preview',
        requestPath: '/api',
        sampleRate: 40,
      });
    });

    it('keeps prose off stdout', async () => {
      useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'preview', '40', '--json');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(client.stdout.getFullOutput()).not.toContain('Set ');
    });
  });

  describe('non-interactive mode', () => {
    it('prints the agent envelope', async () => {
      useTracingProject({ samplingRules: [{ rate: 0.1, env: 'production' }] });

      client.nonInteractive = true;
      client.setArgv('traces', 'config', 'set', 'production', '60');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('ok');
      expect(payload.projectId).toBe('prj_test');
      expect(payload.projectName).toBe('traces-project');
      expect(payload.rule).toEqual({
        environment: 'production',
        requestPath: null,
        sampleRate: 60,
      });
      expect(payload.previousSampleRate).toBe(10);
      expect(payload.message).toContain('60%');
      expect(payload.next[0].command).toContain('traces config ls');
    });
  });

  describe('errors', () => {
    it('surfaces the API message and exits 1 when the PATCH is forbidden', async () => {
      client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
        res.json({
          id: 'prj_test',
          name: 'traces-project',
          accountId: 'team_dummy',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          tracing: { samplingRules: [] },
        });
      });
      client.scenario.patch('/v9/projects/:idOrName', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'You cannot change observability settings',
          },
        });
      });

      client.setArgv('traces', 'config', 'set', 'production', '25');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'You cannot change observability settings'
      );
    });
  });

  describe('telemetry', () => {
    it('tracks the subcommand and redacts the rate and the path', async () => {
      useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'production', '25', '/api');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:config', value: 'config' },
        { key: 'subcommand:set', value: 'set' },
        { key: 'argument:environment', value: 'production' },
        { key: 'argument:rate', value: '[REDACTED]' },
        { key: 'argument:requestPath', value: '[REDACTED]' },
      ]);
    });

    it('redacts an environment word that is not in the closed set', async () => {
      useTracingProject({ samplingRules: [] });

      client.setArgv('traces', 'config', 'set', 'staging', '25');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:config', value: 'config' },
        { key: 'subcommand:set', value: 'set' },
        { key: 'argument:environment', value: '[REDACTED]' },
        { key: 'argument:rate', value: '[REDACTED]' },
      ]);
    });
  });
});
