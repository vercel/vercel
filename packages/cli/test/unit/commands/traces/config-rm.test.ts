import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import * as linkModule from '../../../../src/util/projects/link';
import type {
  ProjectTracing,
  ProjectTracingSamplingRule,
} from '@vercel-internals/types';

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

type PatchCalls = { bodies: Array<Record<string, unknown>> };

function useTracingProject(tracing: ProjectTracing | null) {
  const calls: PatchCalls = { bodies: [] };
  const project = {
    id: 'prj_test',
    name: 'traces-project',
    accountId: 'team_dummy',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    tracing,
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

/** The sampling rules left behind by the single PATCH the command should make. */
function remainingRules(calls: PatchCalls): ProjectTracingSamplingRule[] {
  expect(calls.bodies).toHaveLength(1);
  const tracing = calls.bodies[0].tracing as ProjectTracing;
  return tracing.samplingRules ?? [];
}

/**
 * Runs the command and answers the confirmation prompt.
 *
 * No flag stands in for that answer, so every `rm` that reaches a write goes
 * through the prompt, and answering it belongs in the fixture rather than in
 * each test. The wait keys off the list header, which is printed immediately
 * before the prompt.
 */
async function runAnswering(answer: 'y' | 'n'): Promise<number> {
  const exitCodePromise = traces(client);
  await expect(client.stderr).toOutput('will be removed from');
  client.stdin.write(`${answer}\n`);
  return exitCodePromise;
}

/** One rule of each shape the matcher has to tell apart. */
const mixedRules: ProjectTracingSamplingRule[] = [
  { rate: 0.1, env: 'production' },
  { rate: 0.2, env: 'production', requestPath: '/api' },
  { rate: 0.3, env: 'preview' },
  { rate: 0.4 },
  { rate: 0.5, requestPath: '/blog' },
];

describe('vercel traces config rm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.nonInteractive = false;
    mockLinkedProject();
  });

  it('removes a single rule by environment and path', async () => {
    const calls = useTracingProject({ samplingRules: mixedRules });

    client.setArgv('traces', 'config', 'rm', 'production', '/api');
    const exitCode = await runAnswering('y');

    expect(exitCode).toBe(0);
    expect(remainingRules(calls)).toEqual([
      { rate: 0.1, env: 'production' },
      { rate: 0.3, env: 'preview' },
      { rate: 0.4 },
      { rate: 0.5, requestPath: '/blog' },
    ]);
  });

  it('removes every rule for one environment', async () => {
    const calls = useTracingProject({ samplingRules: mixedRules });

    client.setArgv('traces', 'config', 'rm', 'production');
    const exitCode = await runAnswering('y');

    expect(exitCode).toBe(0);
    expect(remainingRules(calls)).toEqual([
      { rate: 0.3, env: 'preview' },
      { rate: 0.4 },
      { rate: 0.5, requestPath: '/blog' },
    ]);
  });

  it('removes only the rule with no path prefix with --default', async () => {
    const calls = useTracingProject({ samplingRules: mixedRules });

    client.setArgv('traces', 'config', 'rm', 'production', '--default');
    const exitCode = await runAnswering('y');

    expect(exitCode).toBe(0);
    expect(remainingRules(calls)).toEqual([
      { rate: 0.2, env: 'production', requestPath: '/api' },
      { rate: 0.3, env: 'preview' },
      { rate: 0.4 },
      { rate: 0.5, requestPath: '/blog' },
    ]);
  });

  it('`rm any` leaves the preview and production rules untouched', async () => {
    const calls = useTracingProject({ samplingRules: mixedRules });

    client.setArgv('traces', 'config', 'rm', 'any');
    const exitCode = await runAnswering('y');

    expect(exitCode).toBe(0);
    expect(remainingRules(calls)).toEqual([
      { rate: 0.1, env: 'production' },
      { rate: 0.2, env: 'production', requestPath: '/api' },
      { rate: 0.3, env: 'preview' },
    ]);
  });

  it('carries `domains` and `ignorePaths` through untouched', async () => {
    const calls = useTracingProject({
      domains: 'drain.example.com',
      ignorePaths: ['/health'],
      samplingRules: [{ rate: 0.1, env: 'production' }],
    });

    client.setArgv('traces', 'config', 'rm', 'production');
    const exitCode = await runAnswering('y');

    expect(exitCode).toBe(0);
    expect(calls.bodies[0].tracing).toEqual({
      domains: 'drain.example.com',
      ignorePaths: ['/health'],
      samplingRules: [],
    });
  });

  it('accepts `remove` and `delete` as aliases', async () => {
    for (const alias of ['remove', 'delete']) {
      client.reset();
      client.nonInteractive = false;
      mockLinkedProject();
      const calls = useTracingProject({
        samplingRules: [{ rate: 0.1, env: 'production' }],
      });

      client.setArgv('traces', 'config', alias, 'production');
      const exitCode = await runAnswering('y');

      expect(exitCode, alias).toBe(0);
      expect(remainingRules(calls)).toEqual([]);
    }
  });

  describe('nothing matches', () => {
    it('exits 1 and makes no write when the environment has no rules', async () => {
      const calls = useTracingProject({
        samplingRules: [{ rate: 0.1, env: 'production' }],
      });

      client.setArgv('traces', 'config', 'rm', 'preview');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('No trace sampling rule');
    });

    it('exits 1 and makes no write when the path does not match', async () => {
      const calls = useTracingProject({
        samplingRules: [{ rate: 0.1, env: 'production', requestPath: '/api' }],
      });

      client.setArgv('traces', 'config', 'rm', 'production', '/other');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
    });

    it('exits 1 and makes no write when the project has no rules at all', async () => {
      const calls = useTracingProject(null);

      client.setArgv('traces', 'config', 'rm', 'production');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
    });
  });

  describe('confirmation', () => {
    it('lists every rule it will remove and removes them on `y`', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production');
      const exitCode = await runAnswering('y');

      expect(exitCode).toBe(0);
      const stderr = client.stderr.getFullOutput();
      // Both matched rules are shown before the prompt, with path and rate.
      expect(stderr).toContain('(all paths)');
      expect(stderr).toContain('/api');
      expect(stderr).toContain('10%');
      expect(stderr).toContain('20%');
      expect(remainingRules(calls)).toHaveLength(3);
    });

    it('makes no write when the confirmation is declined', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production');
      const exitCode = await runAnswering('n');

      expect(exitCode).toBe(0);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('Canceled');
    });

    /**
     * `--yes` is not accepted: an agent that passes it should fail on an unknown
     * option rather than remove rules nobody agreed to lose. It is rejected at
     * parse time, so the project is never even read.
     */
    it('does not accept --yes', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production', '--yes');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('--yes');
    });

    it('does not accept -y', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production', '-y');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
    });
  });

  // The prompt is the only consent the command takes, so each way of arriving
  // without a person to answer it has to be refused rather than left to reach
  // `input.confirm` and wait forever.
  describe('sessions that cannot confirm', () => {
    function spyExit() {
      return vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);
    }

    // An agent that shells out through a pty keeps a TTY, so `nonInteractive`
    // stays false and this is the case the old `--yes` gate let through.
    it('refuses an agent that has a TTY', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.isAgent = true;
      client.setArgv('traces', 'config', 'rm', 'production');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('cannot prompt');
      expect(stderr).toContain('/api');
      // Nothing asked for JSON, so stdout stays empty.
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('refuses a session with no TTY', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.stdin.isTTY = false;
      client.setArgv('traces', 'config', 'rm', 'production');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('cannot prompt');
    });

    it('names every rule at risk and the command to run by hand', async () => {
      const exitSpy = spyExit();
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.nonInteractive = true;
      client.setArgv('traces', 'config', 'rm', 'production');

      await expect(traces(client)).rejects.toThrow('exit');

      expect(calls.bodies).toHaveLength(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('confirmation_required');
      expect(payload.message).toContain('production (all paths) 10%');
      expect(payload.message).toContain('production /api 20%');
      expect(payload.next[0].command).toContain('traces config rm production');
      // The signal that stops an agent retrying: no flag can grant consent.
      expect(payload.userActionRequired).toBe(true);
      expect(payload.next[0].command).not.toContain('--yes');

      exitSpy.mockRestore();
    });

    it('keeps the selector in the command it suggests', async () => {
      const exitSpy = spyExit();
      useTracingProject({ samplingRules: mixedRules });

      client.nonInteractive = true;
      client.setArgv('traces', 'config', 'rm', 'production', '--default');

      await expect(traces(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next[0].command).toContain(
        'traces config rm production --default'
      );

      exitSpy.mockRestore();
    });

    /**
     * The suggestion is meant to be pasted into a shell, and the path prefix is
     * the one token in it that carries customer data. Unquoted, `/api; touch x`
     * would paste as two commands.
     */
    it('quotes a path prefix that the shell would otherwise read', async () => {
      const exitSpy = spyExit();
      useTracingProject({
        samplingRules: [
          { rate: 0.1, env: 'production', requestPath: '/api; touch /tmp/pwn' },
        ],
      });

      client.nonInteractive = true;
      client.setArgv(
        'traces',
        'config',
        'rm',
        'production',
        '/api; touch /tmp/pwn'
      );

      await expect(traces(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next[0].command).toContain(
        "traces config rm production '/api; touch /tmp/pwn'"
      );

      exitSpy.mockRestore();
    });

    it('reports `not_found` when nothing matches', async () => {
      const exitSpy = spyExit();
      const calls = useTracingProject({
        samplingRules: [{ rate: 0.1, env: 'production' }],
      });

      client.nonInteractive = true;
      client.setArgv('traces', 'config', 'rm', 'preview');

      await expect(traces(client)).rejects.toThrow('exit');

      expect(calls.bodies).toHaveLength(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      // A selector that matches nothing is the more useful complaint of the
      // two, so it is reported ahead of the missing confirmation.
      expect(payload.reason).toBe('not_found');

      exitSpy.mockRestore();
    });
  });

  describe('validation', () => {
    it('rejects an unknown environment word before calling the API', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'staging');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        'any, preview, production'
      );
    });

    it('rejects --default combined with an explicit path', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv(
        'traces',
        'config',
        'rm',
        'production',
        '/api',
        '--default'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.bodies).toHaveLength(0);
    });

    it('prints help and exits 2 when the environment is missing', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('traces config rm');
    });

    it('exits 2 on too many arguments', async () => {
      const calls = useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production', '/api', '/extra');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(calls.bodies).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain('Too many arguments');
    });
  });

  describe('--json', () => {
    it('prints the removed rules', async () => {
      useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production', '--json');
      const exitCode = await runAnswering('y');

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual([
        { environment: 'production', requestPath: null, sampleRate: 10 },
        { environment: 'production', requestPath: '/api', sampleRate: 20 },
      ]);
    });

    it('keeps prose off stdout', async () => {
      useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production', '--json');
      await runAnswering('y');

      expect(client.stdout.getFullOutput()).not.toContain('Removed');
    });

    // The prompt cannot be skipped, and a prompt without the list asks the
    // person to agree to something they cannot see, so the list is printed
    // here too — on stderr, which leaves stdout parseable.
    it('still lists the rules on stderr before prompting', async () => {
      useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production', '--json');
      await runAnswering('y');

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('/api');
      expect(stderr).toContain('20%');
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
          tracing: { samplingRules: [{ rate: 0.1, env: 'production' }] },
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

      client.setArgv('traces', 'config', 'rm', 'production');
      const exitCode = await runAnswering('y');

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'You cannot change observability settings'
      );
    });
  });

  describe('telemetry', () => {
    it('tracks the subcommand and redacts the path', async () => {
      useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'remove', 'production', '/api');
      const exitCode = await runAnswering('y');

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:config', value: 'config' },
        { key: 'subcommand:rm', value: 'remove' },
        { key: 'argument:environment', value: 'production' },
        { key: 'argument:requestPath', value: '[REDACTED]' },
      ]);
    });

    it('tracks --default', async () => {
      useTracingProject({ samplingRules: mixedRules });

      client.setArgv('traces', 'config', 'rm', 'production', '--default');
      const exitCode = await runAnswering('y');

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:config', value: 'config' },
        { key: 'subcommand:rm', value: 'rm' },
        { key: 'argument:environment', value: 'production' },
        { key: 'flag:default', value: 'TRUE' },
      ]);
    });
  });
});
