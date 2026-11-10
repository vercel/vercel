import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  createCiGitRepo,
  createCiInvocation,
  createCiTree,
} from '../../../mocks/ci';
import ci from '../../../../src/commands/ci';
import * as ciApi from '../../../../src/util/ci/api';
import * as ciWait from '../../../../src/commands/ci/wait';
import { printRunView } from '../../../../src/commands/ci/render';
import { toRunView } from '../../../../src/util/ci/run-view';
import type { CiInvocationTree } from '../../../../src/util/ci/types';

const TREE_PATH = '/v1/vercel-ci/invocations/:invocationId/tree';

function writeEvents(res: Response, events: unknown[]) {
  res.setHeader('content-type', 'application/stream+json');
  for (const event of events) {
    res.write(`${JSON.stringify(event)}\n`);
  }
  res.end();
}

const failedTree = () =>
  createCiTree({
    invocation: {
      source: { type: 'vercel-ci' },
      runConclusion: { result: 'failed' },
      completed: { completedAt: Date.now(), conclusion: 'failed' },
    },
    taskConclusion: { result: 'failed', reason: 'command_failed' },
  });

describe('ci inspect', () => {
  let sha: string;

  beforeEach(() => {
    useUser();
    const repo = createCiGitRepo();
    client.cwd = repo.cwd;
    sha = repo.sha;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the jobs and tasks of a run by ID', async () => {
    let requestedId: string | undefined;
    client.scenario.get(TREE_PATH, (req, res) => {
      requestedId = req.params.invocationId;
      res.json(failedTree());
    });

    client.setArgv('ci', 'inspect', 'abc123');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(requestedId).toBe('invo1_abc123');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Vercel CI run abc123');
    expect(stderr).toContain('vercel/next.js');
    expect(stderr).toContain('turbo run build test');
    expect(stderr).toMatch(/web#test\s+failed\s+1m\s+command_failed/);
    expect(stderr).not.toContain('invo1_');
    expect(stderr).not.toContain('tskd1_');
    expect(stderr).toContain('ci logs abc123 --failed --attempt 1');
    expect(stderr).toContain('ci rerun abc123');
  });

  it('inspects the run for the current commit', async () => {
    let listQuery: Record<string, unknown> = {};
    client.scenario.get('/v2/vercel-ci/invocations', (req, res) => {
      listQuery = req.query;
      res.json({
        invocations: [
          createCiInvocation({ invocationId: 'invo1_head', commitSha: sha }),
        ],
        repositories: {},
        pagination: {},
      });
    });
    let requestedId: string | undefined;
    client.scenario.get(TREE_PATH, (req, res) => {
      requestedId = req.params.invocationId;
      res.json(createCiTree());
    });

    client.setArgv('ci', 'inspect');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(listQuery).toMatchObject({
      branchName: 'main',
      snapshot: sha,
      limit: '1',
    });
    expect(requestedId).toBe('invo1_head');
  });

  it('explains when the current commit has no run', async () => {
    client.scenario.get('/v2/vercel-ci/invocations', (_req, res) => {
      res.json({ invocations: [], repositories: {}, pagination: {} });
    });

    client.setArgv('ci', 'inspect');
    const exitCode = await ci(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      `No Vercel CI run found for ${sha.slice(0, 7)} on main.`
    );
  });

  it('preserves literal global context in no-run recovery without leaking credentials', async () => {
    client.scenario.get('/v2/vercel-ci/invocations', (_req, res) => {
      res.json({ invocations: [], repositories: {}, pagination: {} });
    });
    client.nonInteractive = true;
    client.setArgv(
      'ci',
      'inspect',
      '--cwd',
      '/tmp/repo $(unsafe)',
      '--team',
      "a 'quoted' team",
      '--token',
      'secret-context-token'
    );

    expect(await ci(client)).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.reason).toBe('ci_run_not_found');
    expect(payload.next[0].command).toContain("--cwd '/tmp/repo $(unsafe)'");
    expect(payload.next[0].command).toContain(
      "--team 'a '\\''quoted'\\'' team'"
    );
    expect(client.stdout.getFullOutput()).not.toContain('secret-context-token');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('reports unknown flags as JSON in non-interactive mode before fetching', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.nonInteractive = true;
    client.setArgv('ci', 'inspect', '--non-interactive', '--unknown-flag');

    expect(await ci(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('--unknown-flag'),
    });
    expect(client.stderr.getFullOutput()).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])('gives detached HEAD a run-ID recovery without an invalid list request (non-interactive: %s)', async nonInteractive => {
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd: client.cwd });
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.nonInteractive = nonInteractive;
    client.setArgv('ci', 'inspect', '--cwd', '/tmp/a b', '--team', 'acme');

    expect(await ci(client)).toBe(1);
    const command = nonInteractive
      ? JSON.parse(client.stdout.getFullOutput()).next[0].command
      : client.stderr.getFullOutput();
    expect(command).toContain('ci ls --all-branches');
    expect(command).toContain("--cwd '/tmp/a b'");
    expect(command).toContain('--team acme');
    expect(
      client.stdout.getFullOutput() + client.stderr.getFullOutput()
    ).toContain('pass a run ID');
    expect(
      fetchSpy.mock.calls.filter(([url]) => url.includes('/vercel-ci/'))
    ).toEqual([]);
    if (nonInteractive) expect(client.stderr.getFullOutput()).toBe('');
  });

  it('accepts an explicit run ID while HEAD is detached', async () => {
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd: client.cwd });
    const list = vi.spyOn(ciApi, 'listCiInvocations');
    client.scenario.get(TREE_PATH, (_req, res) => res.json(failedTree()));
    client.setArgv('ci', 'inspect', 'abc123');

    expect(await ci(client)).toBe(0);
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects an invalid run ID', async () => {
    client.setArgv('ci', 'inspect', '../abc');
    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Run IDs contain only letters and numbers.'
    );
  });

  it('prints the run as JSON without internal IDs', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => {
      res.json(failedTree());
    });

    client.setArgv('ci', 'inspect', 'abc123', '--format', 'json');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const json = JSON.parse(stdout);
    expect(json.run).toMatchObject({ id: 'abc123', status: 'failed' });
    expect(json.jobs).toEqual([
      expect.objectContaining({
        name: 'turbo run build test',
        kind: 'turbo',
        status: 'running',
        tasks: [
          expect.objectContaining({
            name: 'web#test',
            status: 'failed',
            reason: 'command_failed',
            durationMs: 62_000,
          }),
        ],
      }),
    ]);
    expect(stdout).not.toMatch(/invo1_|jobd1_|tskd1_/);
  });

  it('shows why a run was skipped', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => {
      res.json({
        ...createCiTree({
          invocation: {
            status: 'skipped',
            skipped: { reason: 'no_affected_packages' },
            completed: undefined,
            runConclusion: undefined,
          },
        }),
        jobs: [],
      });
    });

    client.setArgv('ci', 'inspect', 'abc123');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toMatch(
      /Reason\s+no_affected_packages/
    );
  });

  it('explains a run that failed during setup', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => {
      res.json({
        ...createCiTree({
          invocation: {
            status: 'bootstrapping_failed',
            setupConclusion: { result: 'failed' },
            completed: undefined,
            runConclusion: undefined,
          },
        }),
        jobs: [],
      });
    });

    client.setArgv('ci', 'inspect', 'abc123', '--format', 'json');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).run).toMatchObject({
      status: 'failed',
      reason: 'setup_failed',
    });
    expect(client.stderr.getFullOutput()).not.toContain('Setup failed');
  });

  it('requests a specific attempt', async () => {
    let query: Record<string, unknown> = {};
    client.scenario.get(TREE_PATH, (req, res) => {
      query = req.query;
      res.json(createCiTree());
    });

    client.setArgv('ci', 'inspect', 'abc123', '--attempt', '2');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(query.attempt).toBe('2');
  });

  it('suggests waiting for a run that is still running', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => {
      res.json(createCiTree({ running: true }));
    });

    client.setArgv('ci', 'inspect', 'abc123');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('ci inspect abc123 --wait');
  });

  describe('--wait', () => {
    function useStreamingTree(streams: unknown[][]) {
      let streamCount = 0;
      client.scenario.get(TREE_PATH, (req, res) => {
        if (req.query.follow === '1') {
          writeEvents(res, streams[streamCount++] ?? []);
          return;
        }
        res.json(createCiTree({ running: true }));
      });
      return () => streamCount;
    }

    it('streams until the run finishes and exits with 1 when it failed', async () => {
      const running = createCiTree({ running: true });
      useStreamingTree([
        [
          { type: 'tree', ...running },
          { type: 'tree', ...failedTree() },
          { type: 'end', reason: 'completed' },
        ],
      ]);

      client.setArgv('ci', 'inspect', 'abc123', '--wait');
      const exitCode = await ci(client);

      expect(exitCode).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Press Ctrl+C to stop waiting');
      expect(stderr).toMatch(/Status\s+failed/);
      expect(stderr).toContain('ci logs abc123 --failed --attempt 1');
      expect(stderr).toContain('ci rerun abc123');
    });

    it('exits with 0 when the run succeeds', async () => {
      useStreamingTree([
        [
          { type: 'tree', ...createCiTree() },
          { type: 'end', reason: 'completed' },
        ],
      ]);

      client.setArgv('ci', 'inspect', 'abc123', '--wait');
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
    });

    it('reconnects when the stream times out', async () => {
      const streamCount = useStreamingTree([
        [
          { type: 'tree', ...createCiTree({ running: true }) },
          { type: 'end', reason: 'timeout' },
        ],
        [
          { type: 'tree', ...createCiTree() },
          { type: 'end', reason: 'completed' },
        ],
      ]);

      client.setArgv('ci', 'inspect', 'abc123', '--wait', '--format', 'json');
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(streamCount()).toBe(2);
      const json: { run: CiInvocationTree['invocation'] } = JSON.parse(
        client.stdout.getFullOutput()
      );
      expect(json.run).toMatchObject({ status: 'succeeded' });
    });

    it('returns immediately for a finished run', async () => {
      let streamCount = 0;
      client.scenario.get(TREE_PATH, (req, res) => {
        if (req.query.follow === '1') {
          streamCount++;
          writeEvents(res, []);
          return;
        }
        res.json(createCiTree());
      });

      client.setArgv('ci', 'inspect', 'abc123', '--wait');
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(streamCount).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('Press Ctrl+C');
      expect(client.stderr.getFullOutput()).not.toContain('Waiting for');
    });
  });

  it('prints an agent payload in non-interactive mode', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => {
      res.json(createCiTree({ running: true }));
    });
    client.nonInteractive = true;

    client.setArgv('ci', 'inspect', 'abc123');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      message: 'The Vercel CI run running.',
      run: { id: 'abc123', status: 'running' },
      next: [expect.objectContaining({ when: 'Wait for this run to finish' })],
    });
  });

  it.each([
    'queued',
    'running',
    'succeeded',
    'failed',
    'skipped',
    'completed',
  ] as const)('includes a status message in successful non-interactive inspections (%s)', async status => {
    const tree = createCiTree({
      invocation: {
        status:
          status === 'queued'
            ? 'new'
            : status === 'running'
              ? 'awaiting_jobs'
              : status,
        completed: undefined,
        runConclusion:
          status === 'succeeded' || status === 'failed' || status === 'skipped'
            ? { result: status }
            : undefined,
      },
    });
    client.scenario.get(TREE_PATH, (_req, res) => res.json(tree));
    client.nonInteractive = true;
    client.setArgv('ci', 'inspect', 'abc123');

    expect(await ci(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      message: `The Vercel CI run ${status}.`,
      run: { id: 'abc123', status },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    undefined,
    'deployment',
    'unknown',
  ])('suggests logs only for an unsupported rerun source (source: %s)', async source => {
    const tree = failedTree();
    tree.invocation.source = source ? { type: source } : undefined;
    client.scenario.get(TREE_PATH, (_req, res) => res.json(tree));
    client.nonInteractive = true;
    client.setArgv('ci', 'inspect', 'abc123');

    expect(await ci(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const payload = JSON.parse(stdout);
    expect(payload.next).toEqual([
      {
        command: expect.stringContaining('ci logs abc123 --failed --attempt 1'),
        when: 'Show logs for the failed tasks',
      },
    ]);
    expect(stdout).not.toContain('ci rerun');
    expect(payload.run).not.toHaveProperty('source');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('preserves attempt and safe global context in suggested wait commands without leaking tokens', async () => {
    const tree = createCiTree({ running: true, invocation: { attempt: 2 } });
    client.scenario.get(TREE_PATH, (_req, res) => res.json(tree));
    client.nonInteractive = true;
    client.setArgv(
      'ci',
      'inspect',
      'abc123',
      '--attempt',
      '2',
      '--cwd',
      '/tmp/a b',
      '--team',
      'acme',
      '--non-interactive',
      '--token',
      'secret-token'
    );

    expect(await ci(client)).toBe(0);
    const { next } = JSON.parse(client.stdout.getFullOutput());
    expect(next).toHaveLength(1);
    expect(next[0].command).toContain('ci inspect abc123 --wait --attempt 2');
    for (const step of next) {
      expect(step.command).toContain("--cwd '/tmp/a b'");
      expect(step.command).toContain('--team acme');
      expect(step.command).toContain('--non-interactive');
      expect(step.command).not.toContain('secret-token');
      expect(step.command).not.toContain('--token');
    }
  });

  it('preserves attempt and safe global context in suggested logs and rerun commands without leaking tokens', async () => {
    const tree = failedTree();
    tree.invocation.attempt = 2;
    client.scenario.get(TREE_PATH, (_req, res) => res.json(tree));
    client.nonInteractive = true;
    client.setArgv(
      'ci',
      'inspect',
      'abc123',
      '--attempt',
      '2',
      '--cwd',
      '/tmp/a b',
      '--team',
      'acme',
      '--non-interactive',
      '--token',
      'secret-token'
    );

    expect(await ci(client)).toBe(0);
    const { next } = JSON.parse(client.stdout.getFullOutput());
    expect(next).toHaveLength(2);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(next[0].command).toContain('ci logs abc123 --failed --attempt 2');
    expect(next[1].command).toContain('ci rerun abc123');
    expect(next[1].command).not.toContain('--attempt');
    for (const step of next) {
      expect(step.command).toContain("--cwd '/tmp/a b'");
      expect(step.command).toContain('--team acme');
      expect(step.command).toContain('--non-interactive');
      expect(step.command).not.toContain('secret-token');
      expect(step.command).not.toContain('--token');
    }
  });

  it('pins suggested waiting to the inspected attempt', async () => {
    client.scenario.get(TREE_PATH, (_req, res) =>
      res.json(createCiTree({ running: true, invocation: { attempt: 2 } }))
    );
    client.nonInteractive = true;
    client.setArgv('ci', 'inspect', 'abc123', '--attempt', '2');

    expect(await ci(client)).toBe(0);
    const { next } = JSON.parse(client.stdout.getFullOutput());
    expect(next[0].command).toContain('ci inspect abc123 --wait --attempt 2');
    expect(next).toHaveLength(1);
  });

  it('reports a failed non-interactive wait as an error with recovery commands', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => res.json(failedTree()));
    client.nonInteractive = true;
    client.setArgv('ci', 'inspect', 'abc123', '--wait');

    expect(await ci(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'ci_run_failed',
      message: 'The Vercel CI run failed.',
      run: { status: 'failed' },
      next: [
        {
          command: expect.stringContaining(
            'ci logs abc123 --failed --attempt 1'
          ),
          when: 'Show logs for the failed tasks',
        },
        {
          command: expect.stringContaining('ci rerun abc123'),
          when: 'Start a new attempt of this run',
        },
      ],
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    false,
    true,
  ])('treats skipped --wait as an intentional no-op (non-interactive: %s)', async nonInteractive => {
    client.scenario.get(TREE_PATH, (_req, res) =>
      res.json(
        createCiTree({
          invocation: {
            status: 'skipped',
            skipped: { reason: 'no_affected_packages' },
            completed: undefined,
            runConclusion: undefined,
          },
        })
      )
    );
    client.nonInteractive = nonInteractive;
    client.setArgv('ci', 'inspect', 'abc123', '--wait');

    expect(await ci(client)).toBe(0);
    if (nonInteractive) {
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'ok',
        message: 'The Vercel CI run skipped.',
        run: { status: 'skipped', reason: 'no_affected_packages' },
        next: [],
      });
    } else {
      expect(client.stderr.getFullOutput()).toMatch(/Status\s+skipped/);
      expect(client.stderr.getFullOutput()).not.toContain('Waiting for');
    }
  });

  it.each([
    'ci_wait_timeout',
    'ci_wait_interrupted',
  ] as const)('offers inspection after %s', async reason => {
    client.scenario.get(TREE_PATH, (_req, res) =>
      res.json(createCiTree({ running: true, invocation: { attempt: 2 } }))
    );
    vi.spyOn(ciWait, 'waitForRun').mockRejectedValueOnce(
      new ciWait.CiWaitError(reason)
    );
    client.nonInteractive = true;
    client.setArgv(
      'ci',
      'inspect',
      'abc123',
      '--wait',
      '--attempt',
      '2',
      '--team',
      'acme'
    );

    expect(await ci(client)).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason,
      message: expect.stringContaining('may still be running'),
      next: [
        {
          when: 'Check the status of this attempt',
          command: expect.stringContaining('ci inspect abc123 --attempt 2'),
        },
      ],
    });
    expect(payload.next[0].command).toContain('--team acme');
    expect(payload.next[0].command).not.toContain('--wait');
    expect(payload.next[0].command).not.toContain('rerun');
  });

  describe.each([
    ['--json'],
    ['--format', 'json'],
  ])('explicit JSON wait errors (%s)', (...selector) => {
    it.each([
      'ci_wait_timeout',
      'ci_wait_interrupted',
    ] as const)('prints a structured %s error without human output', async reason => {
      client.scenario.get(TREE_PATH, (_req, res) =>
        res.json(createCiTree({ running: true, invocation: { attempt: 2 } }))
      );
      const error = new ciWait.CiWaitError(reason);
      vi.spyOn(ciWait, 'waitForRun').mockRejectedValueOnce(error);
      client.nonInteractive = false;
      client.setArgv(
        'ci',
        'inspect',
        'abc123',
        '--wait',
        '--attempt',
        '2',
        ...selector
      );

      expect(await ci(client)).toBe(1);
      expect(client.nonInteractive).toBe(false);
      const stdout = client.stdout.getFullOutput();
      expect(JSON.parse(stdout)).toEqual({
        status: 'error',
        reason,
        message: error.message,
        next: [
          {
            command: expect.stringContaining('ci inspect abc123 --attempt 2'),
            when: 'Check the status of this attempt',
          },
        ],
      });
      expect(stdout).not.toContain('\u001b');
      expect(client.stderr.getFullOutput()).toBe('');
    });
  });

  it('escapes all remote terminal metadata while preserving raw JSON data', async () => {
    const dirty = '\u001b[31mremote\u001b[0m\n\r\t\u0000\u0085';
    const tree = failedTree();
    tree.invocation.ref = `refs/heads/${dirty}`;
    tree.invocation.commitSha = '\nabc\rd';
    tree.invocation.skipped = { reason: dirty };
    tree.repositories[tree.invocation.repositoryKey] = {
      owner: dirty,
      name: dirty,
    };
    tree.jobs[0].definition.name = dirty;
    tree.jobs[0].tasks[0].definition.name = dirty;
    tree.jobs[0].tasks[0].run!.completed!.conclusion = {
      result: 'failed',
      reason: dirty,
    };
    const view = toRunView(tree);
    printRunView(view, '0ms');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain(dirty);
    expect(stderr).not.toContain('\u001b[31m');
    expect(stderr).not.toMatch(/[\r\t\u0000\u0085]/);
    expect(stderr).toContain('remote\\n\\r\\t\\u0000\\u0085');
    expect(stderr).toContain('\\nabc\\rd');

    client.scenario.get(TREE_PATH, (_req, res) => res.json(tree));
    client.setArgv('ci', 'inspect', 'abc123', '--format', 'json');
    expect(await ci(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.run.branch).toBe(dirty);
    expect(payload.run.reason).toBe(dirty);
    expect(payload.jobs[0].name).toBe(dirty);
    expect(payload.jobs[0].tasks[0].reason).toBe(dirty);
  });

  describe('bounded stream waiting', () => {
    const target = { invocationId: 'invo1_abc123', accountId: 'team_dummy' };
    const running = () =>
      createCiTree({ running: true, invocation: { attempt: 2 } });

    it.each([
      false,
      true,
    ])('backs off and bounds clean closes (tree received: %s)', async sendTree => {
      vi.useFakeTimers();
      const stream = vi
        .spyOn(ciApi, 'streamCiInvocationTree')
        .mockImplementation(async function* () {
          if (sendTree) yield { type: 'tree', ...running() };
        });
      const result = ciWait.waitForRun(client, target, running(), true);
      const assertion = expect(result).rejects.toMatchObject({
        reason: 'ci_wait_interrupted',
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(stream).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1999);
      expect(stream).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(stream).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000);
      await assertion;
      expect(stream).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
      expect(stream.mock.calls[0][2]).toMatchObject({
        attempt: 2,
        accountId: 'team_dummy',
      });
      expect(stream.mock.calls[0][2].signal!.aborted).toBe(true);
    });

    it('backs off thrown failures and stops after 3 interrupted sessions', async () => {
      vi.useFakeTimers();
      const stream = vi
        .spyOn(ciApi, 'streamCiInvocationTree')
        .mockImplementation(async function* () {
          yield { type: 'tree', ...running() };
          throw new Error('connection lost');
        });
      const result = ciWait.waitForRun(client, target, running(), true);
      const assertion = expect(result).rejects.toMatchObject({
        reason: 'ci_wait_interrupted',
      });
      await vi.advanceTimersByTimeAsync(4000);
      await assertion;
      expect(stream).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('bounds repeated protocol timeouts with a 10-minute overall deadline', async () => {
      vi.useFakeTimers();
      const stream = vi
        .spyOn(ciApi, 'streamCiInvocationTree')
        .mockImplementation(async function* () {
          yield { type: 'tree', ...running() };
          yield { type: 'end', reason: 'timeout' };
        });
      const result = ciWait.waitForRun(client, target, running(), true);
      const assertion = expect(result).rejects.toMatchObject({
        reason: 'ci_wait_timeout',
      });
      await vi.advanceTimersByTimeAsync(599999);
      expect(stream).toHaveBeenCalledTimes(300);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(stream.mock.calls[0][2].signal!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('aborts a stalled stream at the overall deadline', async () => {
      vi.useFakeTimers();
      const stream = vi
        .spyOn(ciApi, 'streamCiInvocationTree')
        .mockImplementation(async function* (_client, _id, options) {
          await new Promise<void>(resolve =>
            options.signal!.addEventListener('abort', () => resolve(), {
              once: true,
            })
          );
        });
      const result = ciWait.waitForRun(client, target, running(), true);
      const assertion = expect(result).rejects.toMatchObject({
        reason: 'ci_wait_timeout',
      });
      await vi.advanceTimersByTimeAsync(600000);
      await assertion;
      expect(stream).toHaveBeenCalledTimes(1);
      expect(stream.mock.calls[0][2].signal!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('finishes on a terminal tree even without an end event', async () => {
      vi.useFakeTimers();
      const terminal = failedTree();
      terminal.invocation.attempt = running().invocation.attempt;
      vi.spyOn(ciApi, 'streamCiInvocationTree').mockImplementation(
        async function* () {
          yield { type: 'tree', ...terminal };
        }
      );
      expect(await ciWait.waitForRun(client, target, running(), true)).toEqual(
        terminal
      );
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('reports a missing run', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'No' } });
    });

    client.setArgv('ci', 'inspect', 'abc123');
    const exitCode = await ci(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Couldn't find that Vercel CI run for this team."
    );
  });
});
