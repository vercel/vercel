import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  createCiGitRepo,
  createCiInvocation,
  createCiTree,
} from '../../../mocks/ci';
import ci from '../../../../src/commands/ci';
import * as wait from '../../../../src/commands/ci/wait';

const RETRY_PATH =
  '/v1/vercel-ci/invocations/:invocationId/attempts/:attempt/retry';
const TREE_PATH = '/v1/vercel-ci/invocations/:invocationId/tree';
const ATTEMPTS_PATH = '/v1/vercel-ci/invocations/:invocationId/attempts';

function useAttempts(latest: number) {
  client.scenario.get(ATTEMPTS_PATH, (_req, res) => {
    res.json({
      attempts: Array.from({ length: latest }, (_, i) =>
        createCiInvocation({ attempt: i + 1 })
      ),
      repositories: {},
    });
  });
}

function sourceTree(attempt = 1) {
  const tree = createCiTree({
    invocation: {
      attempt,
      runConclusion: { result: 'failed' },
      completed: { completedAt: Date.now(), conclusion: 'failed' },
    },
  });
  return {
    ...tree,
    invocation: { ...tree.invocation, source: { type: 'vercel-ci' } },
  };
}

function useSource(tree = sourceTree()) {
  client.scenario.get(TREE_PATH, (_req, res) => res.json(tree));
}

function useRetry(attempt = 2) {
  let posts = 0;
  client.scenario.post(RETRY_PATH, (_req, res) => {
    posts++;
    res.json({ invocationId: 'invo1_abc123', attempt });
  });
  return () => posts;
}

function payload() {
  return JSON.parse(client.stdout.getFullOutput());
}

describe('ci rerun', () => {
  let sha: string;

  beforeEach(() => {
    useUser();
    const repo = createCiGitRepo();
    client.cwd = repo.cwd;
    sha = repo.sha;
    vi.restoreAllMocks();
  });

  function useHead(attempt: number) {
    client.scenario.get('/v2/vercel-ci/invocations', (_req, res) => {
      res.json({
        invocations: [createCiInvocation({ attempt, commitSha: sha })],
        repositories: {},
        pagination: {},
      });
    });
  }

  it('previews the source before mutation and uses the latest attempt', async () => {
    useSource(sourceTree(2));
    useAttempts(2);
    let params: Record<string, string> = {};
    client.scenario.post(RETRY_PATH, (req, res) => {
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toMatch(/Repository\s+vercel\/next.js/);
      expect(stderr).toMatch(/Branch\s+main/);
      expect(stderr).toMatch(new RegExp(`Commit\\s+${'a'.repeat(40)}`));
      expect(stderr).toMatch(/Previous status\s+attempt 2 · failed/);
      expect(stderr).not.toMatch(
        /[✓▲!] (Repository|Branch|Commit|Previous status)/
      );
      params = req.params;
      res.json({ invocationId: 'invo1_abc123', attempt: 3 });
    });

    client.setArgv('ci', 'rerun', 'abc123');
    expect(await ci(client)).toBe(0);
    expect(params).toEqual({ invocationId: 'invo1_abc123', attempt: '2' });
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toMatch(/✓ Started\s+attempt 3 of run abc123/);
    expect(stderr).toContain('ci inspect abc123 --attempt 3 --wait');
    expect(stderr).not.toContain('Success!');
  });

  it('refreshes a stale HEAD list attempt immediately before POST', async () => {
    const requests: string[] = [];
    useHead(1);
    client.scenario.get(TREE_PATH, (req, res) => {
      requests.push('tree');
      expect(req.query.attempt).toBeUndefined();
      res.json(sourceTree(4));
    });
    client.scenario.get(ATTEMPTS_PATH, (_req, res) => {
      requests.push('attempts');
      res.json({ attempts: [createCiInvocation({ attempt: 4 })] });
    });
    client.scenario.post(RETRY_PATH, (req, res) => {
      requests.push('post');
      expect(req.params.attempt).toBe('4');
      res.json({ invocationId: 'invo1_abc123', attempt: 5 });
    });

    client.setArgv('ci', 'rerun');
    expect(await ci(client)).toBe(0);
    expect(requests).toEqual(['tree', 'attempts', 'post']);
  });

  it('does not mutate when the preview becomes stale', async () => {
    useSource(sourceTree(1));
    useAttempts(2);
    const posts = useRetry();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(0);
    expect(payload()).toMatchObject({
      status: 'error',
      reason: 'source_not_latest',
      next: [{ command: expect.stringContaining('ci inspect abc123') }],
    });
    expect(payload().message).not.toContain("hasn't finished");
    expect(payload().next[0].command).not.toContain('rerun');
  });

  it.each([
    'succeeded',
    'skipped',
  ] as const)('requires an explicit run ID for a %s HEAD without prompting', async status => {
    useHead(1);
    const tree = sourceTree();
    tree.invocation.runConclusion = { result: status };
    tree.invocation.completed = {
      completedAt: Date.now(),
      conclusion: status,
    };
    useSource(tree);
    const posts = useRetry();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(0);
    expect(payload()).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      userActionRequired: true,
      run: { id: 'abc123', status },
      next: [{ command: expect.stringContaining('ci rerun abc123') }],
    });
    expect(payload().message).toContain('Pass its run ID explicitly');
    expect(client.stderr.getFullOutput()).not.toContain('Started');
  });

  it.each([
    'succeeded',
    'skipped',
  ] as const)('treats an explicit ID as intent to rerun a %s run', async status => {
    const tree = sourceTree();
    tree.invocation.runConclusion = { result: status };
    useSource(tree);
    useAttempts(1);
    const posts = useRetry();
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(0);
    expect(posts()).toBe(1);
  });

  it.each([
    'deployment',
    'git',
    'unknown-source',
  ])('rejects a known non-Vercel-CI source (%s) before mutation', async type => {
    const tree = sourceTree();
    tree.invocation.source = { type };
    useSource(tree);
    const posts = useRetry();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(0);
    expect(payload().reason).toBe('ci_run_not_retryable');
    expect(payload().message).toContain('deployment-native checks');
    expect(payload().message).not.toContain('Git push');
  });

  it('rejects an unfinished source before mutation with exact-attempt wait recovery', async () => {
    useSource({
      ...sourceTree(),
      invocation: {
        ...createCiTree({ running: true }).invocation,
        source: { type: 'vercel-ci' },
      },
    });
    const posts = useRetry();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(0);
    expect(payload().reason).toBe('ci_run_in_progress');
    expect(payload().next[0].command).toContain(
      'ci inspect abc123 --attempt 1 --wait'
    );
  });

  it.each([
    [
      'retry_not_supported',
      'ci_run_not_retryable',
      'Only runs with a Vercel CI source',
    ],
    ['source_not_latest', 'source_not_latest', 'a newer attempt exists'],
    ['retry_not_allowed', 'ci_run_in_progress', "hasn't finished"],
    ['other_conflict', 'api_error', 'Failed to start'],
  ])('classifies 409 %s without blindly retrying', async (code, reason, message) => {
    useSource();
    useAttempts(1);
    let posts = 0;
    client.scenario.post(RETRY_PATH, (_req, res) => {
      posts++;
      res.status(409).json({ error: { code, message: 'Conflict' } });
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(1);
    expect(posts).toBe(1);
    expect(payload()).toMatchObject({ status: 'error', reason });
    expect(payload().message).toContain(message);
    expect(payload().message).not.toContain('Git push');
    if (code !== 'retry_not_allowed') {
      expect(payload().message).not.toContain("hasn't finished");
    }
    expect(payload().next[0].command).toContain('ci inspect abc123');
    expect(payload().next[0].command).not.toContain('rerun');
  });

  it.each([
    500, 429,
  ])('does not retry a mutation after HTTP %s', async status => {
    useSource();
    useAttempts(1);
    let posts = 0;
    client.scenario.post(RETRY_PATH, (_req, res) => {
      posts++;
      res.setHeader('retry-after', '0');
      res
        .status(status)
        .json({ error: { code: 'request_failed', message: 'Failed' } });
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(1);
    expect(posts).toBe(1);
    expect(payload().next[0].command).toContain('ci inspect abc123');
  });

  it('does not retry a mutation after a lost response', async () => {
    useSource();
    useAttempts(1);
    let posts = 0;
    client.scenario.post(RETRY_PATH, req => {
      posts++;
      req.socket.destroy();
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(1);
    expect(posts).toBe(1);
    expect(payload().message).toContain("wasn't retried");
    expect(payload().next[0].command).not.toContain('rerun');
  });

  it('does not mutate if fetching the source fails', async () => {
    client.scenario.get(TREE_PATH, (_req, res) => {
      res
        .status(403)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } });
    });
    const posts = useRetry();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(0);
    expect(payload().reason).toBe('permission_denied');
  });

  it('prints terminal-safe source metadata', async () => {
    const tree = sourceTree();
    tree.repositories['ownr1_test:repo1_test'].owner = '\u001b[31mowner\n';
    tree.invocation.ref = 'refs/heads/branch\r\nforged';
    useSource(tree);
    useAttempts(1);
    useRetry();
    client.setArgv('ci', 'rerun', 'abc123');

    expect(await ci(client)).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('owner\\n/next.js');
    expect(stderr).toContain('branch\\r\\nforged');
    expect(stderr).not.toContain('\u001b[31m');
  });

  it('prints the new attempt as JSON without human output', async () => {
    useSource();
    useAttempts(1);
    useRetry();
    client.setArgv('ci', 'rerun', 'abc123', '--format', 'json');

    expect(await ci(client)).toBe(0);
    expect(payload()).toEqual({ run: { id: 'abc123', attempt: 2 } });
    expect(client.stderr.getFullOutput()).not.toMatch(
      /Repository|Started|Starting/
    );
  });

  it('prints an agent receipt with safe context-preserving exact-attempt recovery', async () => {
    useSource();
    useAttempts(1);
    useRetry();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123');
    client.argv.push(
      '--cwd',
      '/tmp/repo $(unsafe)',
      '--team',
      'a team',
      '--token',
      'secret'
    );

    expect(await ci(client)).toBe(0);
    expect(payload()).toMatchObject({
      status: 'ok',
      run: { id: 'abc123', attempt: 2 },
      message: 'Started attempt 2 of run abc123.',
      next: [{ when: 'Wait for the new attempt to finish' }],
    });
    const command = payload().next[0].command;
    expect(command).toContain('ci inspect abc123 --attempt 2 --wait');
    expect(command).toContain("--cwd '/tmp/repo $(unsafe)'");
    expect(command).toContain("--team 'a team'");
    expect(command).not.toContain('secret');
    expect(command).not.toContain('--token');
  });

  it.each([
    'failed',
    'succeeded',
    'skipped',
  ] as const)('waits for the new attempt and reports %s with matching agent status and exit', async status => {
    useAttempts(1);
    const posts = useRetry();
    const treeAttempts: unknown[] = [];
    const finished = createCiTree({
      invocation: {
        attempt: 2,
        runConclusion: { result: status },
        completed: { completedAt: Date.now(), conclusion: status },
      },
    });
    client.scenario.get(TREE_PATH, (req, res) => {
      treeAttempts.push(req.query.attempt);
      if (!req.query.attempt) return res.json(sourceTree());
      if (req.query.follow === '1') {
        res.setHeader('content-type', 'application/stream+json');
        res.write(`${JSON.stringify({ type: 'tree', ...finished })}\n`);
        res.write(`${JSON.stringify({ type: 'end', reason: 'completed' })}\n`);
        return res.end();
      }
      return res.json(
        createCiTree({ running: true, invocation: { attempt: 2 } })
      );
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123', '--wait');

    expect(await ci(client)).toBe(status === 'failed' ? 1 : 0);
    expect(posts()).toBe(1);
    expect(treeAttempts).toEqual([undefined, '2', '2']);
    expect(payload()).toMatchObject({
      status: status === 'failed' ? 'error' : 'ok',
      run: { id: 'abc123', attempt: 2, status },
      message: `Attempt 2 of run abc123 ${status}.`,
    });
    expect(payload().reason).toBe(
      status === 'failed' ? 'ci_run_failed' : undefined
    );
    expect(payload().next[0].command).toContain('--attempt 2');
    expect(payload().next[0].command).not.toContain('rerun');
  });

  it.each([
    'ci_wait_timeout',
    'ci_wait_interrupted',
  ] as const)('preserves the mutation receipt and safe recovery after %s', async reason => {
    useSource();
    useAttempts(1);
    const posts = useRetry();
    vi.spyOn(wait, 'waitForRun').mockRejectedValueOnce(
      new wait.CiWaitError(reason)
    );
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123', '--wait');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(1);
    expect(payload()).toMatchObject({
      status: 'error',
      reason,
      run: { id: 'abc123', attempt: 2 },
    });
    expect(payload().message).toContain('Started attempt 2 of run abc123');
    expect(payload().next[0].command).toContain(
      'ci inspect abc123 --attempt 2'
    );
    expect(payload().next[0].command).not.toContain('rerun');
  });

  it('prints a human started receipt before waiting and keeps it on a wait error', async () => {
    useSource();
    useAttempts(1);
    const posts = useRetry();
    vi.spyOn(wait, 'waitForRun').mockImplementationOnce(async () => {
      expect(client.stderr.getFullOutput()).toMatch(
        /✓ Started\s+attempt 2 of run abc123/
      );
      throw new wait.CiWaitError('ci_wait_interrupted');
    });
    client.setArgv('ci', 'rerun', 'abc123', '--wait');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Started attempt 2 of run abc123, but failed to wait'
    );
    expect(stderr).toContain('ci inspect abc123 --attempt 2');
    expect(stderr).not.toContain('ci rerun');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('prints the human receipt before the failed waited run', async () => {
    useSource();
    useAttempts(1);
    const posts = useRetry();
    vi.spyOn(wait, 'waitForRun').mockResolvedValueOnce(sourceTree(2));
    client.setArgv('ci', 'rerun', 'abc123', '--wait');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toMatch(/✓ Started\s+attempt 2 of run abc123/);
    expect(stderr).toMatch(/Status\s+failed/);
    expect(stderr.indexOf('Started')).toBeLessThan(stderr.indexOf('Status'));
    expect(stderr).toContain('ci logs abc123 --attempt 2 --failed');
  });

  it('preserves the plain JSON waited run view', async () => {
    useSource();
    useAttempts(1);
    useRetry();
    vi.spyOn(wait, 'waitForRun').mockResolvedValueOnce(
      createCiTree({
        invocation: { attempt: 2 },
      })
    );
    client.setArgv('ci', 'rerun', 'abc123', '--wait', '--format', 'json');

    expect(await ci(client)).toBe(0);
    expect(payload()).toMatchObject({
      run: { id: 'abc123', attempt: 2, status: 'succeeded' },
    });
    expect(payload().status).toBeUndefined();
    expect(client.stderr.getFullOutput()).not.toContain('Started');
  });

  it('leaves a green HEAD untouched in human mode and gives the explicit run command', async () => {
    useHead(1);
    const tree = sourceTree();
    tree.invocation.runConclusion = { result: 'succeeded' };
    useSource(tree);
    const posts = useRetry();
    client.setArgv('ci', 'rerun');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Pass its run ID explicitly');
    expect(stderr).toContain('ci rerun abc123');
    expect(stderr).not.toContain('Started');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('keeps a JSON wait error parseable with the durable attempt receipt', async () => {
    useSource();
    useAttempts(1);
    const posts = useRetry();
    vi.spyOn(wait, 'waitForRun').mockRejectedValueOnce(
      new wait.CiWaitError('ci_wait_timeout')
    );
    client.setArgv('ci', 'rerun', 'abc123', '--wait', '--format', 'json');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(1);
    expect(payload()).toMatchObject({
      status: 'error',
      reason: 'ci_wait_timeout',
      run: { id: 'abc123', attempt: 2 },
    });
    expect(client.stderr.getFullOutput()).not.toContain('Started');
  });

  it('retains the new attempt when the initial wait fetch fails', async () => {
    useAttempts(1);
    const posts = useRetry();
    client.scenario.get(TREE_PATH, (req, res) => {
      if (!req.query.attempt) return res.json(sourceTree());
      return res
        .status(403)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } });
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', 'abc123', '--wait');

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(1);
    expect(payload()).toMatchObject({
      status: 'error',
      run: { id: 'abc123', attempt: 2 },
    });
    expect(payload().message).toContain('Started attempt 2');
    expect(payload().next[0].command).toContain('--attempt 2');
    expect(payload().next[0].command).not.toContain('rerun');
  });

  it('reports unknown flags as JSON in non-interactive mode before fetching', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun', '--non-interactive', '--unknown-flag');

    expect(await ci(client)).toBe(2);
    expect(payload()).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('--unknown-flag'),
    });
    expect(client.stderr.getFullOutput()).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not resolve or rerun HEAD without a branch when detached', async () => {
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd: client.cwd });
    const fetchSpy = vi.spyOn(client, 'fetch').mockClear();
    client.nonInteractive = true;
    client.setArgv('ci', 'rerun');

    expect(await ci(client)).toBe(1);
    expect(payload().message).toContain('HEAD is detached');
    expect(payload().next[0].command).toContain('ci ls --all-branches');
    expect(
      fetchSpy.mock.calls.filter(([url]) => url.includes('/vercel-ci/'))
    ).toEqual([]);
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('retains safe global context after a wait failure without suggesting another mutation', async () => {
    useSource();
    useAttempts(1);
    const posts = useRetry();
    vi.spyOn(wait, 'waitForRun').mockRejectedValueOnce(
      new wait.CiWaitError('ci_wait_interrupted')
    );
    client.nonInteractive = true;
    client.setArgv(
      'ci',
      'rerun',
      'abc123',
      '--wait',
      '--cwd',
      '/tmp/repo $(unsafe)',
      '--scope',
      'a team',
      '--non-interactive',
      '-t',
      'secret-wait-token'
    );

    expect(await ci(client)).toBe(1);
    expect(posts()).toBe(1);
    expect(payload().run).toEqual({ id: 'abc123', attempt: 2 });
    const command = payload().next[0].command;
    expect(command).toContain('ci inspect abc123 --attempt 2');
    expect(command).toContain("--cwd '/tmp/repo $(unsafe)'");
    expect(command).toContain("--scope 'a team'");
    expect(command).toContain('--non-interactive');
    expect(command).not.toContain('--wait');
    expect(command).not.toContain('rerun');
    expect(
      client.stdout.getFullOutput() + client.stderr.getFullOutput()
    ).not.toContain('secret-wait-token');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('rejects an invalid run ID before calling the API', async () => {
    const posts = useRetry();
    client.setArgv('ci', 'rerun', 'abc;rm');
    expect(await ci(client)).toBe(2);
    expect(posts()).toBe(0);
  });
});
