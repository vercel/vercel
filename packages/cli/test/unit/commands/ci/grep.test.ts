import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  createCiGitRepo,
  createCiInvocation,
  createCiTree,
} from '../../../mocks/ci';
import ci from '../../../../src/commands/ci';
import chars from '../../../../src/util/output/chars';

type Query = Record<string, string | string[] | undefined>;

const LIST_PATH = '/v2/vercel-ci/invocations';
const SEARCH_PATH = '/v1/vercel-ci/log-search';

function task(
  name: string,
  messages: string[],
  conclusion: Record<string, string> = {
    result: 'failed',
    reason: 'command_failed',
  }
) {
  return {
    jobDefinitionId: 'jobd1_turbo',
    jobName: 'Turborepo',
    jobRunAttempt: 1,
    taskDefinitionId: `tskd1_${name}`,
    taskName: name,
    taskRunAttempt: 1,
    conclusion,
    lines: messages.map((message, i) => ({
      level: 'error',
      timestamp: Date.UTC(2026, 8, 1, 0, 0, i),
      message,
    })),
  };
}

describe('ci grep', () => {
  const currentTrees = new Map<string, ReturnType<typeof createCiTree>>();
  const resolutionRequests: string[] = [];
  beforeEach(() => {
    currentTrees.clear();
    resolutionRequests.length = 0;
    useUser();
    client.cwd = createCiGitRepo().cwd;
  });

  function useRuns(invocations = defaultRuns()) {
    const latest = new Map<string, ReturnType<typeof createCiInvocation>>();
    for (const invocation of invocations) {
      const previous = latest.get(invocation.invocationId);
      if (!previous || previous.attempt < invocation.attempt) {
        latest.set(invocation.invocationId, invocation);
      }
    }
    for (const invocation of latest.values()) useCurrentAttempt(invocation);
    let query: Query = {};
    client.scenario.get(LIST_PATH, (req, res) => {
      query = req.query as Query;
      res.json({ invocations, repositories: {}, pagination: {} });
    });
    return () => query;
  }

  function defaultRuns() {
    return [
      createCiInvocation({ invocationId: 'invo1_newer', attempt: 2 }),
      createCiInvocation({ invocationId: 'invo1_newer', attempt: 1 }),
      createCiInvocation({
        invocationId: 'invo1_older',
        commitSha: 'b'.repeat(40),
      }),
    ];
  }

  function useSearch(body: unknown) {
    let query: Query = {};
    client.scenario.get(SEARCH_PATH, (req, res) => {
      query = req.query as Query;
      res.json(body);
    });
    return () => query;
  }

  function useCurrentAttempt(
    invocation: ReturnType<typeof createCiInvocation>,
    tasks: ReturnType<typeof task>[] = []
  ) {
    const tree = createCiTree({ invocation });
    const template = tree.jobs[0];
    tree.jobs = tasks.map(task => ({
      ...template,
      definition: {
        ...template.definition,
        jobDefinitionId: task.jobDefinitionId,
        name: task.jobName,
      },
      run: {
        ...template.run!,
        jobDefinitionId: task.jobDefinitionId,
        attempt: task.jobRunAttempt,
      },
      tasks: [
        {
          definition: {
            ...template.tasks[0].definition,
            jobDefinitionId: task.jobDefinitionId,
            jobRunAttempt: task.jobRunAttempt,
            taskDefinitionId: task.taskDefinitionId,
            name: task.taskName,
          },
          run: {
            ...template.tasks[0].run!,
            taskDefinitionId: task.taskDefinitionId,
            attempt: task.taskRunAttempt,
          },
        },
      ],
    }));
    const registered = currentTrees.has(invocation.invocationId);
    currentTrees.set(invocation.invocationId, tree);
    if (!registered) {
      const base = `/v1/vercel-ci/invocations/${invocation.invocationId}`;
      client.scenario.get(`${base}/attempts`, (_req, res) => {
        resolutionRequests.push(`${base}/attempts`);
        res.json({
          attempts: [currentTrees.get(invocation.invocationId)!.invocation],
        });
      });
      client.scenario.get(`${base}/tree`, (req, res) => {
        resolutionRequests.push(`${base}/tree`);
        const current = currentTrees.get(invocation.invocationId)!;
        expect(req.query.attempt).toBe(String(current.invocation.attempt));
        res.json(current);
      });
    }
    return tree;
  }

  it('searches the latest attempt of recent runs on the current branch', async () => {
    const listQuery = useRuns();
    useCurrentAttempt(createCiInvocation({ invocationId: 'invo1_older' }), [
      task('api#test', []),
    ]);
    const searchQuery = useSearch({
      invocations: [
        {
          invocationId: 'invo1_older',
          attempt: 1,
          tasks: [task('api#test', ['Error: ECONNRESET while fetching'])],
        },
      ],
      hasMore: false,
    });

    client.setArgv('ci', 'grep', 'econnreset');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(listQuery()).toMatchObject({ branchName: 'main', limit: '20' });
    expect(searchQuery()).toMatchObject({
      invocation: ['invo1_newer:2', 'invo1_older:1'],
      search: 'econnreset',
    });
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Searched the last 2 runs for');
    expect(stderr).toContain('Run older');
    expect(stderr).toContain(
      'Turborepo › api#test · job attempt 1 · task attempt 1 · failed · command_failed'
    );
    expect(stderr).toContain(
      "vercel ci logs older --attempt 1 '--task=api#test'"
    );
    expect(stderr).toContain('1 matching line in 1 run of 2 searched');
    expect(client.stdout.getFullOutput()).toMatch(
      /^ {4}\S+ {2}error {2}Error: ECONNRESET while fetching\n$/
    );
  });

  it('passes the branch, status, run count, and level filters', async () => {
    const listQuery = useRuns();
    for (const run of [defaultRuns()[0], defaultRuns()[2]]) {
      useCurrentAttempt(
        createCiInvocation({ ...run, runConclusion: { result: 'failed' } })
      );
    }
    const searchQuery = useSearch({ invocations: [], hasMore: false });

    client.setArgv(
      'ci',
      'grep',
      'oom',
      '--all-branches',
      '--status',
      'failed',
      '--runs',
      '50',
      '--level',
      'error'
    );
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(listQuery()).toMatchObject({ limit: '50' });
    expect(listQuery().conclusion).toBeUndefined();
    expect(listQuery().status).toBeUndefined();
    expect(listQuery().branchName).toBeUndefined();
    expect(searchQuery()).toMatchObject({ level: 'error' });
    expect(client.stderr.getFullOutput()).toContain(
      'No log lines match "oom".'
    );
  });

  it.each([
    {
      status: 'queued',
      state: { status: 'new', completed: undefined, runConclusion: undefined },
    },
    {
      status: 'running',
      state: {
        status: 'awaiting_jobs',
        completed: undefined,
        runConclusion: undefined,
      },
    },
    {
      status: 'succeeded',
      state: { runConclusion: { result: 'succeeded' as const } },
    },
    {
      status: 'failed',
      state: { runConclusion: { result: 'failed' as const } },
    },
    {
      status: 'skipped',
      state: { runConclusion: { result: 'skipped' as const } },
    },
  ])('filters $status using the current attempt instead of historical attempt rows', async ({
    status,
    state,
  }) => {
    const current = createCiInvocation({
      invocationId: 'invo1_matching',
      attempt: 2,
      ...state,
    });
    const other = createCiInvocation({
      invocationId: 'invo1_other',
      attempt: 2,
      runConclusion: {
        result: status === 'succeeded' ? 'failed' : 'succeeded',
      },
    });
    const listQuery = useRuns([
      createCiInvocation({ invocationId: current.invocationId, attempt: 1 }),
      other,
    ]);
    useCurrentAttempt(current);
    const searchQuery = useSearch({ invocations: [], hasMore: false });
    client.setArgv(
      'ci',
      'grep',
      'error',
      '--status',
      status,
      '--runs',
      '2',
      '--json'
    );
    expect(await ci(client)).toBe(0);
    expect(listQuery().conclusion).toBeUndefined();
    expect(listQuery().status).toBeUndefined();
    expect(searchQuery().invocation).toBe('invo1_matching:2');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      searchedRuns: 1,
      selection: { requestedRuns: 2, scannedRuns: 2, limited: false },
    });
  });

  it('prints matches as JSON with the command to show each addressable task', async () => {
    useRuns();
    useCurrentAttempt(defaultRuns()[0], [task('web#build', [])]);
    useSearch({
      invocations: [
        {
          invocationId: 'invo1_newer',
          attempt: 2,
          tasks: [task('web#build', ['heap out of memory'])],
        },
      ],
      hasMore: false,
    });

    client.setArgv('ci', 'grep', 'memory', '--format', 'json');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(JSON.parse(stdout)).toMatchObject({
      search: 'memory',
      searchedRuns: 2,
      matches: { lines: 1, runs: 1 },
      runs: [
        {
          id: 'newer',
          attempt: 2,
          branch: 'main',
          tasks: [
            {
              job: 'Turborepo',
              name: 'web#build',
              status: 'failed',
              reason: 'command_failed',
              command: "vercel ci logs newer --attempt 2 '--task=web#build'",
              locator: {
                invocationId: 'invo1_newer',
                attempt: 2,
                jobDefinitionId: 'jobd1_turbo',
                jobRunAttempt: 1,
                taskDefinitionId: 'tskd1_web#build',
                taskRunAttempt: 1,
              },
              lines: [
                {
                  timestamp: '2026-09-01T00:00:00.000Z',
                  level: 'error',
                  message: 'heap out of memory',
                },
              ],
            },
          ],
        },
      ],
      hasMore: false,
    });
    expect(JSON.parse(stdout).runs[0].id).toBe('newer');
  });

  it('notes when more lines matched than were returned', async () => {
    useRuns();
    useSearch({
      invocations: [
        {
          invocationId: 'invo1_newer',
          attempt: 2,
          tasks: [task('web#build', ['warning'])],
        },
      ],
      hasMore: true,
    });

    client.setArgv('ci', 'grep', 'warning');
    await ci(client);

    expect(client.stderr.getFullOutput()).toContain(
      'Showing the newest 1 matching lines.'
    );
  });

  it('says when there are no runs to search', async () => {
    useRuns([]);

    client.setArgv('ci', 'grep', 'boom');
    const exitCode = await ci(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No Vercel CI runs found for'
    );
  });

  it('follows pages until the requested number of distinct invocations is found', async () => {
    useCurrentAttempt(
      createCiInvocation({ invocationId: 'invo1_newer', attempt: 3 })
    );
    useCurrentAttempt(createCiInvocation({ invocationId: 'invo1_older' }));
    const cursors: unknown[] = [];
    client.scenario.get(LIST_PATH, (req, res) => {
      cursors.push(req.query.cursor);
      const page = req.query.cursor
        ? [
            createCiInvocation({ invocationId: 'invo1_newer', attempt: 1 }),
            createCiInvocation({ invocationId: 'invo1_older' }),
          ]
        : [
            createCiInvocation({ invocationId: 'invo1_newer', attempt: 3 }),
            createCiInvocation({ invocationId: 'invo1_newer', attempt: 2 }),
          ];
      res.json({
        invocations: page,
        repositories: {},
        pagination: { nextCursor: 'page2' },
      });
    });
    const searchQuery = useSearch({ invocations: [], hasMore: false });
    client.setArgv('ci', 'grep', 'error', '--runs', '2', '--json');
    expect(await ci(client)).toBe(0);
    expect(cursors).toEqual([undefined, 'page2']);
    expect(searchQuery().invocation).toEqual([
      'invo1_newer:3',
      'invo1_older:1',
    ]);
    expect(JSON.parse(client.stdout.getFullOutput()).searchedRuns).toBe(2);
  });

  it('reports the actual count when pagination ends before --runs', async () => {
    useRuns(defaultRuns().slice(0, 2));
    useSearch({ invocations: [], hasMore: false });
    client.setArgv('ci', 'grep', 'error', '--runs', '2', '--json');
    expect(await ci(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).searchedRuns).toBe(1);
  });

  it.each(['repeat', 'cap'])('bounds scanning with a %s cursor', async mode => {
    useCurrentAttempt(createCiInvocation());
    let pages = 0;
    client.scenario.get(LIST_PATH, (_req, res) => {
      pages++;
      res.json({
        invocations: [createCiInvocation()],
        repositories: {},
        pagination: {
          nextCursor: mode === 'repeat' ? 'same' : `page${pages}`,
        },
      });
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'grep', 'error', '--runs', '2');
    useSearch({ invocations: [], hasMore: false });
    expect(await ci(client)).toBe(mode === 'repeat' ? 1 : 0);
    expect(pages).toBe(mode === 'repeat' ? 2 : 100);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject(
      mode === 'repeat'
        ? {
            status: 'error',
            message: expect.stringContaining('pagination cursor'),
          }
        : {
            status: 'ok',
            searchedRuns: 1,
            selection: { requestedRuns: 2, scannedRuns: 1, limited: true },
            message: expect.stringContaining('Results are partial'),
            next: [],
          }
    );
  });

  it('does not fill a status-filtered window with historical failures from recovered runs', async () => {
    const failed = ['invo1_failedA', 'invo1_failedB'].map(invocationId =>
      createCiInvocation({ invocationId, runConclusion: { result: 'failed' } })
    );
    const recovered = Array.from({ length: 150 }, (_, i) =>
      createCiInvocation({ invocationId: `invo1_recovered${i}`, attempt: 2 })
    );
    for (const invocation of [...failed, ...recovered])
      useCurrentAttempt(invocation);
    const queries: Query[] = [];
    client.scenario.get(LIST_PATH, (req, res) => {
      queries.push(req.query as Query);
      // An attempt-level failed filter hides the two latest failed runs behind
      // historical failures; an unfiltered newest-first page starts with them.
      const rows = req.query.conclusion
        ? recovered.map(run =>
            createCiInvocation({
              ...run,
              attempt: 1,
              runConclusion: { result: 'failed' },
            })
          )
        : [...failed, ...recovered];
      const start = Number(req.query.cursor ?? 0);
      res.json({
        invocations: rows.slice(start, start + 2),
        repositories: {},
        pagination:
          start + 2 < rows.length ? { nextCursor: String(start + 2) } : {},
      });
    });
    const searchQuery = useSearch({ invocations: [], hasMore: false });
    client.setArgv(
      'ci',
      'grep',
      'error',
      '--status',
      'failed',
      '--runs',
      '2',
      '--json'
    );
    expect(await ci(client)).toBe(0);
    expect(queries).toHaveLength(1);
    expect(queries[0].conclusion).toBeUndefined();
    expect(queries[0].status).toBeUndefined();
    expect(searchQuery().invocation).toEqual([
      'invo1_failedA:1',
      'invo1_failedB:1',
    ]);
    expect(resolutionRequests).toHaveLength(4);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      searchedRuns: 2,
      selection: { requestedRuns: 2, scannedRuns: 2, limited: false },
    });
  });

  it('excludes old failed attempts and continues scanning for current failed runs', async () => {
    const recovered = createCiInvocation({
      invocationId: 'invo1_recovered',
      attempt: 2,
    });
    const failed = createCiInvocation({
      invocationId: 'invo1_failed',
      attempt: 3,
      runConclusion: { result: 'failed' },
    });
    const another = createCiInvocation({
      invocationId: 'invo1_another',
      runConclusion: { result: 'failed' },
    });
    useCurrentAttempt(recovered);
    useCurrentAttempt(failed);
    useCurrentAttempt(another);
    const cursors: unknown[] = [];
    client.scenario.get(LIST_PATH, (req, res) => {
      cursors.push(req.query.cursor);
      res.json({
        invocations: req.query.cursor
          ? [failed, another]
          : [
              createCiInvocation({
                ...recovered,
                attempt: 1,
                runConclusion: { result: 'failed' },
              }),
              createCiInvocation({ ...failed, attempt: 1 }),
            ],
        repositories: {},
        pagination: req.query.cursor ? {} : { nextCursor: 'more' },
      });
    });
    const searchQuery = useSearch({ invocations: [], hasMore: false });
    client.setArgv(
      'ci',
      'grep',
      'error',
      '--status',
      'failed',
      '--runs',
      '2',
      '--json'
    );
    expect(await ci(client)).toBe(0);
    expect(cursors).toEqual([undefined, 'more']);
    expect(searchQuery().invocation).toEqual([
      'invo1_failed:3',
      'invo1_another:1',
    ]);
    expect(JSON.parse(client.stdout.getFullOutput()).searchedRuns).toBe(2);
  });

  it.each([
    'human',
    'agent',
    'json',
  ])('distinguishes an exhausted status-filtered empty selection from a missing run (%s)', async mode => {
    const recovered = createCiInvocation({
      invocationId: 'invo1_recovered',
      attempt: 2,
    });
    useRuns([
      createCiInvocation({
        ...recovered,
        attempt: 1,
        runConclusion: { result: 'failed' },
      }),
    ]);
    useCurrentAttempt(recovered);
    client.nonInteractive = mode === 'agent';
    client.setArgv(
      'ci',
      'grep',
      'error',
      '--status',
      'failed',
      ...(mode === 'json' ? ['--json'] : [])
    );
    expect(await ci(client)).toBe(0);
    if (mode === 'human') {
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('No Vercel CI runs match the current filters');
      expect(stderr).not.toContain('No Vercel CI runs found');
      expect(stderr).not.toContain('Results are partial');
      expect(client.stdout.getFullOutput()).toBe('');
    } else {
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        searchedRuns: 0,
        selection: { requestedRuns: 20, scannedRuns: 1, limited: false },
        matches: { lines: 0, runs: 0 },
        runs: [],
        hasMore: false,
      });
      if (mode === 'agent')
        expect(payload).toMatchObject({
          status: 'ok',
          message: 'No Vercel CI runs match the current filters.',
          next: [],
        });
      expect(client.stderr.getFullOutput()).toBe('');
    }
  });

  it('resolves latest attempts outside an unfiltered page before searching', async () => {
    useRuns([createCiInvocation({ invocationId: 'invo1_newer', attempt: 1 })]);
    useCurrentAttempt(
      createCiInvocation({ invocationId: 'invo1_newer', attempt: 4 })
    );
    const searchQuery = useSearch({
      invocations: [
        {
          invocationId: 'invo1_newer',
          attempt: 1,
          tasks: [task('build', ['stale error'])],
        },
        {
          invocationId: 'invo1_newer',
          attempt: 4,
          tasks: [task('build', ['latest error'])],
        },
      ],
      hasMore: false,
    });
    client.setArgv('ci', 'grep', 'error', '--runs', '1', '--json');
    expect(await ci(client)).toBe(0);
    expect(searchQuery().invocation).toBe('invo1_newer:4');
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0].attempt).toBe(4);
    expect(payload.runs[0].tasks[0].lines[0].message).toBe('latest error');
    expect(client.stdout.getFullOutput()).not.toContain('stale error');
  });

  it.each([
    'older-attempt',
    'wrong-tree',
  ])('rejects %s latest state before searching', async mode => {
    const invocation = createCiInvocation({ attempt: 3 });
    useRuns([invocation]);
    const tree = useCurrentAttempt({
      ...invocation,
      attempt: mode === 'older-attempt' ? 2 : 3,
    });
    if (mode === 'wrong-tree') tree.invocation.invocationId = 'invo1_other';
    client.nonInteractive = true;
    client.setArgv('ci', 'grep', 'error');
    expect(await ci(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput()).message).toContain(
      'invalid latest attempt'
    );
  });

  it.each([
    false,
    true,
  ])('preserves historical job/task execution locators in JSON=%s without misleading commands', async json => {
    const invocation = defaultRuns()[0];
    useRuns([invocation]);
    const current = {
      ...task('build', []),
      jobRunAttempt: 3,
      taskRunAttempt: 2,
    };
    useCurrentAttempt(invocation, [current]);
    const historical = {
      ...task('build', ['old job error']),
      jobRunAttempt: 1,
      taskRunAttempt: 4,
    };
    const oldTask = {
      ...current,
      taskRunAttempt: 1,
      lines: task('build', ['old task error']).lines,
    };
    useSearch({
      invocations: [
        {
          invocationId: invocation.invocationId,
          attempt: invocation.attempt,
          tasks: [historical, oldTask],
        },
      ],
      hasMore: false,
    });
    client.setArgv('ci', 'grep', 'error', ...(json ? ['--json'] : []));
    expect(await ci(client)).toBe(0);
    if (json) {
      const tasks = JSON.parse(client.stdout.getFullOutput()).runs[0].tasks;
      expect(tasks).toHaveLength(2);
      expect(tasks[0].locator).toEqual({
        invocationId: 'invo1_newer',
        attempt: 2,
        jobDefinitionId: 'jobd1_turbo',
        jobRunAttempt: 1,
        taskDefinitionId: 'tskd1_build',
        taskRunAttempt: 4,
      });
      expect(tasks[1].locator).toMatchObject({
        jobRunAttempt: 3,
        taskRunAttempt: 1,
      });
      for (const task of tasks) expect(task).not.toHaveProperty('command');
    } else {
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('job attempt 1 · task attempt 4');
      expect(stderr).toContain('job attempt 3 · task attempt 1');
      expect(stderr).not.toContain('vercel ci logs');
      expect(client.stdout.getFullOutput()).toContain('old job error');
      expect(client.stdout.getFullOutput()).toContain('old task error');
    }
  });

  it.each([
    false,
    true,
  ])('does not suggest name-based logs for a same-name task in another job in JSON=%s', async json => {
    const invocation = defaultRuns()[0];
    useRuns([invocation]);
    const first = task('build', ['error']);
    const second = {
      ...task('build', []),
      jobDefinitionId: 'jobd1_other',
      taskDefinitionId: 'tskd1_other',
      jobName: 'Other job',
    };
    useCurrentAttempt(invocation, [first, second]);
    // Only one task matched; ambiguity must be checked against the whole tree.
    useSearch({
      invocations: [
        {
          invocationId: invocation.invocationId,
          attempt: invocation.attempt,
          tasks: [first],
        },
      ],
      hasMore: false,
    });
    client.setArgv('ci', 'grep', 'error', ...(json ? ['--json'] : []));
    expect(await ci(client)).toBe(0);
    if (json) {
      const match = JSON.parse(client.stdout.getFullOutput()).runs[0].tasks[0];
      expect(match.locator).toMatchObject({
        jobDefinitionId: 'jobd1_turbo',
        taskDefinitionId: 'tskd1_build',
      });
      expect(match).not.toHaveProperty('command');
    } else {
      expect(client.stderr.getFullOutput()).toContain('job attempt 1');
      expect(client.stderr.getFullOutput()).not.toContain('vercel ci logs');
    }
  });

  it('keeps a quoted follow-up for a unique current execution after job/task retries', async () => {
    const invocation = defaultRuns()[0];
    useRuns([invocation]);
    const current = {
      ...task('web#build', ['error']),
      jobRunAttempt: 3,
      taskRunAttempt: 2,
    };
    useCurrentAttempt(invocation, [current]);
    useSearch({
      invocations: [
        {
          invocationId: invocation.invocationId,
          attempt: invocation.attempt,
          tasks: [current],
        },
      ],
      hasMore: false,
    });
    client.setArgv('ci', 'grep', 'error', '--json');
    expect(await ci(client)).toBe(0);
    const match = JSON.parse(client.stdout.getFullOutput()).runs[0].tasks[0];
    expect(match.command).toBe(
      "vercel ci logs newer --attempt 2 '--task=web#build'"
    );
    expect(match.locator).toMatchObject({
      jobRunAttempt: 3,
      taskRunAttempt: 2,
    });
  });

  it('bounds status-filtered scans when every candidate has recovered', async () => {
    const recovered = createCiInvocation({ attempt: 2 });
    useCurrentAttempt(recovered);
    let pages = 0;
    client.scenario.get(LIST_PATH, (_req, res) => {
      pages++;
      res.json({
        invocations: [
          createCiInvocation({
            attempt: 1,
            runConclusion: { result: 'failed' },
          }),
        ],
        repositories: {},
        pagination: { nextCursor: `page${pages}` },
      });
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'grep', 'error', '--status', 'failed', '--runs', '1');
    expect(await ci(client)).toBe(0);
    expect(pages).toBe(100);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'ok',
      searchedRuns: 0,
      selection: { requestedRuns: 1, scannedRuns: 1, limited: true },
      message: expect.stringContaining('among the runs checked'),
      next: [],
    });
    expect(payload.message).toContain('Results are partial');
  });

  function useCandidateScan(
    total: number,
    failedFrom: number,
    pageSize = 50,
    hasMore = true,
    withMatch = false
  ) {
    const candidates = Array.from({ length: total }, (_, i) => {
      const invocation = createCiInvocation({
        invocationId: `invo1_candidate${i}`,
        attempt: 2,
        ...(i >= failedFrom ? { runConclusion: { result: 'failed' } } : {}),
      });
      useCurrentAttempt(invocation);
      return createCiInvocation({
        ...invocation,
        attempt: 1,
        runConclusion: { result: 'failed' },
      });
    });
    let pages = 0;
    let searches = 0;
    let searchedInvocations: Query['invocation'];
    client.scenario.get(LIST_PATH, (req, res) => {
      expect(req.query.limit).toBe('50');
      expect(req.query.conclusion).toBeUndefined();
      expect(req.query.status).toBeUndefined();
      const start = pages++ * pageSize;
      res.json({
        invocations: candidates.slice(start, start + pageSize),
        repositories: {},
        pagination:
          hasMore || start + pageSize < total
            ? { nextCursor: `page${pages}` }
            : {},
      });
    });
    client.scenario.get(SEARCH_PATH, (req, res) => {
      searches++;
      searchedInvocations = (req.query as Query).invocation;
      const first = Array.isArray(searchedInvocations)
        ? searchedInvocations[0]
        : searchedInvocations;
      const [invocationId, attempt] = first!.split(':');
      res.json({
        invocations: withMatch
          ? [
              {
                invocationId,
                attempt: Number(attempt),
                tasks: [task('build', ['error from accepted run'])],
              },
            ]
          : [],
        hasMore: false,
      });
    });
    return () => ({ pages, searches, searchedInvocations });
  }

  it.each([
    { mode: 'human', failedFrom: 150 },
    { mode: 'human', failedFrom: 75 },
    { mode: 'agent', failedFrom: 150 },
    { mode: 'agent', failedFrom: 75 },
    { mode: 'json', failedFrom: 150 },
    { mode: 'json', failedFrom: 75 },
  ])('searches accepted runs and reports scan limits without discarding results ($mode, failedFrom=$failedFrom)', async ({
    mode,
    failedFrom,
  }) => {
    const scan = useCandidateScan(150, failedFrom, 50, true, true);
    const accepted = Math.max(0, 100 - failedFrom);
    client.nonInteractive = mode === 'agent';
    client.setArgv(
      'ci',
      'grep',
      'error',
      '--status',
      'failed',
      '--runs',
      '50',
      ...(mode === 'json' ? ['--json'] : [])
    );
    expect(await ci(client)).toBe(0);
    expect(scan()).toMatchObject({ pages: 2, searches: accepted ? 1 : 0 });
    expect(resolutionRequests).toHaveLength(200);
    expect(new Set(resolutionRequests).size).toBe(200);
    if (mode !== 'human') {
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        searchedRuns: accepted,
        selection: { requestedRuns: 50, scannedRuns: 100, limited: true },
        matches: { lines: accepted ? 1 : 0, runs: accepted ? 1 : 0 },
        hasMore: false,
      });
      if (mode === 'agent') {
        expect(payload).toMatchObject({ status: 'ok', next: [] });
        expect(payload.message).toContain('Results are partial');
        if (!accepted)
          expect(payload.message).toContain('among the runs checked');
      }
      if (accepted)
        expect(payload.runs[0].tasks[0].lines[0].message).toBe(
          'error from accepted run'
        );
      expect(client.stderr.getFullOutput()).toBe('');
    } else {
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        '! Recent-run scan reached its limit after checking 100 runs.'
      );
      expect(stderr).toContain(
        'Results are partial; narrow with --git-branch or remove --status.'
      );
      expect(stderr).not.toContain('Failed to find');
      if (accepted) {
        expect(client.stdout.getFullOutput()).toContain(
          'error from accepted run'
        );
        expect(stderr).toContain('Searched 25 runs');
        expect(stderr).not.toContain('Searched the last');
      } else {
        expect(client.stdout.getFullOutput()).toBe('');
        expect(stderr).toContain('among the runs checked');
        expect(stderr).not.toContain('No Vercel CI runs found');
      }
    }
  });

  it('enforces the candidate budget even inside an oversized final page', async () => {
    const scan = useCandidateScan(101, 101, 101, false);
    client.nonInteractive = true;
    client.setArgv('ci', 'grep', 'error', '--status', 'failed', '--runs', '50');
    expect(await ci(client)).toBe(0);
    expect(scan()).toMatchObject({ pages: 1, searches: 0 });
    expect(resolutionRequests).toHaveLength(200);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      searchedRuns: 0,
      selection: { requestedRuns: 50, scannedRuns: 100, limited: true },
      message: expect.stringContaining('Results are partial'),
      next: [],
    });
  });

  it('returns all 50 requested latest failed runs at the candidate budget boundary', async () => {
    const scan = useCandidateScan(150, 50);
    client.setArgv(
      'ci',
      'grep',
      'error',
      '--status',
      'failed',
      '--runs',
      '50',
      '--json'
    );
    expect(await ci(client)).toBe(0);
    expect(scan()).toEqual({
      pages: 2,
      searches: 1,
      searchedInvocations: Array.from(
        { length: 50 },
        (_, i) => `invo1_candidate${i + 50}:2`
      ),
    });
    expect(resolutionRequests).toHaveLength(200);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      searchedRuns: 50,
      selection: { requestedRuns: 50, scannedRuns: 100, limited: false },
    });
  });

  it('allows genuine pagination exhaustion at the candidate budget boundary', async () => {
    const scan = useCandidateScan(100, 75, 50, false);
    client.setArgv(
      'ci',
      'grep',
      'error',
      '--status',
      'failed',
      '--runs',
      '50',
      '--json'
    );
    expect(await ci(client)).toBe(0);
    expect(scan()).toMatchObject({ pages: 2, searches: 1 });
    expect(resolutionRequests).toHaveLength(200);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      searchedRuns: 25,
      selection: { requestedRuns: 50, scannedRuns: 100, limited: false },
    });
  });

  it('does not invent an exact task attempt when search omits it', async () => {
    const invocation = defaultRuns()[0];
    useRuns([invocation]);
    const current = task('build', ['error']);
    useCurrentAttempt(invocation, [current]);
    const { taskRunAttempt: _attempt, ...unknownAttempt } = current;
    useSearch({
      invocations: [
        {
          invocationId: invocation.invocationId,
          attempt: invocation.attempt,
          tasks: [unknownAttempt],
        },
      ],
      hasMore: false,
    });
    client.setArgv('ci', 'grep', 'error', '--json');
    expect(await ci(client)).toBe(0);
    const match = JSON.parse(client.stdout.getFullOutput()).runs[0].tasks[0];
    expect(match).not.toHaveProperty('command');
    expect(match.locator).not.toHaveProperty('taskRunAttempt');
    expect(match.locator.jobRunAttempt).toBe(1);
  });

  it.each([
    ['İ', 'İstanbul followed by text', 'İ'],
    ['text', 'İstanbul followed by TEXT', 'TEXT'],
    ['[error].', 'İ [ERROR]. followed by text', '[ERROR].'],
  ])('highlights literal %s without changing Unicode characters', async (search, message, highlighted) => {
    useRuns();
    useSearch({
      invocations: [
        {
          invocationId: 'invo1_newer',
          attempt: 2,
          tasks: [task('build', [message])],
        },
      ],
      hasMore: false,
    });
    client.setArgv('ci', 'grep', search);
    const level = chalk.level;
    try {
      chalk.level = 1;
      expect(await ci(client)).toBe(0);
      const stdout = client.stdout.getFullOutput();
      expect(stripAnsi(stdout)).toContain(message);
      expect(stdout).toContain(chalk.red.bold(highlighted));
    } finally {
      chalk.level = level;
    }
  });

  it.each([
    ['attempts', false],
    ['attempts', true],
    ['tree', false],
    ['tree', true],
  ] as const)('reports a missing run for %s 404 with nonInteractive=%s', async (route, nonInteractive) => {
    const invocation = createCiInvocation();
    const base = `/v1/vercel-ci/invocations/${invocation.invocationId}`;
    client.scenario.get(LIST_PATH, (_req, res) =>
      res.json({ invocations: [invocation], repositories: {}, pagination: {} })
    );
    client.scenario.get(`${base}/attempts`, (_req, res) => {
      if (route === 'attempts') {
        res
          .status(404)
          .json({ error: { code: 'not_found', message: 'Not found' } });
      } else {
        res.json({ attempts: [invocation] });
      }
    });
    client.scenario.get(`${base}/tree`, (_req, res) =>
      res
        .status(404)
        .json({ error: { code: 'not_found', message: 'Not found' } })
    );
    client.nonInteractive = nonInteractive;
    client.setArgv('ci', 'grep', 'error');

    expect(await ci(client)).toBe(1);
    const stdout = client.stdout.getFullOutput();
    const stderr = stripAnsi(client.stderr.getFullOutput());
    const message = "Couldn't find that Vercel CI run for this team.";
    if (nonInteractive) {
      expect(JSON.parse(stdout)).toMatchObject({
        status: 'error',
        reason: 'ci_run_not_found',
        message,
      });
      expect(stderr).toBe('');
    } else {
      expect(stderr).toContain(`${chars.fatal} ${message}`);
      expect(stderr).not.toContain('Error:');
      expect(stdout).toBe('');
    }
    expect(stdout + stderr).not.toContain(
      "The Vercel CI endpoint wasn't found."
    );
  });

  it.each([
    LIST_PATH,
    SEARCH_PATH,
  ])('reports a collection endpoint 404 for %s', async path => {
    if (path === SEARCH_PATH) useRuns();
    client.scenario.get(path, (_req, res) =>
      res
        .status(404)
        .json({ error: { code: 'not_found', message: 'Not found' } })
    );
    client.nonInteractive = true;
    client.setArgv('ci', 'grep', 'error');
    expect(await ci(client)).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.message).toContain(
      path === LIST_PATH
        ? 'find recent Vercel CI runs'
        : 'search Vercel CI logs'
    );
    expect(payload.message).not.toContain('find that Vercel CI run');
    expect(payload.reason).toBe('api_error');
  });

  it.each([
    false,
    true,
  ])('keeps raw logs in JSON=%s and terminal matches on one line', async json => {
    useRuns();
    const message =
      '\u001b[31merror\u001b[0m\nnext\rline\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007';
    const unsafeTask = task('build\nname', [message], {
      result: 'failed\nstatus',
      reason: 'why\nnow',
    });
    unsafeTask.jobName = 'job\u001b[31m\nname';
    unsafeTask.lines[0].level = 'error\nlevel';
    useSearch({
      invocations: [
        { invocationId: 'invo1_newer', attempt: 2, tasks: [unsafeTask] },
      ],
      hasMore: false,
    });
    client.setArgv('ci', 'grep', 'error', ...(json ? ['--json'] : []));
    expect(await ci(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    if (json) {
      expect(JSON.parse(stdout).runs[0].tasks[0].lines[0].message).toBe(
        message
      );
    } else {
      expect(stdout.trimEnd().split('\n')).toHaveLength(1);
      expect(stdout).toContain('error\\nnext\\rline');
      expect(stdout).not.toContain('\u001b');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('job\\nname › build\\nname');
      expect(stderr).toContain('failed\\nstatus');
      expect(stderr).toContain('why\\nnow');
    }
  });

  it('sanitizes the human search summary and empty-match output', async () => {
    useRuns();
    useSearch({ invocations: [], hasMore: false });
    client.setArgv('ci', 'grep', 'error\n\u001b[31mnext');
    expect(await ci(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('"error\\nnext"');
    expect(client.stderr.getFullOutput()).not.toContain('\u001b');
  });

  describe.each([
    { cwd: '/tmp/ci-grep', expectedCwd: '/tmp/ci-grep' },
    { cwd: '/tmp/ci grep', expectedCwd: "'/tmp/ci grep'" },
    {
      cwd: String.raw`C:\Users\runner\project`,
      expectedCwd: String.raw`'C:\Users\runner\project'`,
    },
    {
      cwd: String.raw`C:\Users\runner\my project`,
      expectedCwd: String.raw`'C:\Users\runner\my project'`,
    },
  ])('suggested command context for $cwd', ({ cwd, expectedCwd }) => {
    it.each([
      '--scope',
      '--team',
    ])('quotes remote task names and preserves %s context', async teamFlag => {
      useRuns();
      const name = "-build '$(touch /tmp/not-executed)'";
      useCurrentAttempt(defaultRuns()[0], [task(name, [])]);
      useSearch({
        invocations: [
          {
            invocationId: 'invo1_newer',
            attempt: 2,
            tasks: [task(name, ['error'])],
          },
        ],
        hasMore: false,
      });
      client.setArgv(
        'ci',
        'grep',
        'error',
        '--json',
        teamFlag,
        'team_dummy',
        '--cwd',
        cwd,
        '--token',
        'secret-token'
      );
      expect(await ci(client)).toBe(0);
      const command = JSON.parse(client.stdout.getFullOutput()).runs[0].tasks[0]
        .command;
      expect(command).toContain("'--task=-build ");
      expect(command).toContain("'\\''");
      expect(command).toContain(`${teamFlag} team_dummy`);
      expect(command).toContain(`--cwd ${expectedCwd}`);
      expect(command).not.toContain('secret-token');
      expect(command).not.toContain('--token');
    });
  });

  it('rejects untrusted API run IDs before searching or suggesting commands', async () => {
    useRuns([
      createCiInvocation({ invocationId: 'invo1_abc;touch /tmp/not-executed' }),
    ]);
    client.nonInteractive = true;
    client.setArgv('ci', 'grep', 'error');
    expect(await ci(client)).toBe(1);
    const stdout = client.stdout.getFullOutput();
    expect(JSON.parse(stdout).message).toContain('invalid run ID');
    expect(stdout).not.toContain('touch');
  });

  it.each([
    'empty',
    'no-matches',
    'matches',
  ])('emits stable non-interactive %s results', async mode => {
    useRuns(mode === 'empty' ? [] : defaultRuns());
    useSearch({
      invocations:
        mode === 'matches'
          ? [
              {
                invocationId: 'invo1_newer',
                attempt: 2,
                tasks: [task('build', ['error'])],
              },
            ]
          : [],
      hasMore: false,
    });
    client.nonInteractive = true;
    client.setArgv('ci', 'grep', 'error');
    expect(await ci(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      message: expect.stringMatching(/\S/),
      next: [],
      selection: {
        requestedRuns: 20,
        scannedRuns: mode === 'empty' ? 0 : 2,
        limited: false,
      },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    [[], 'Pass the text to search for.'],
    [['a', 'b'], 'Pass the text to search for.'],
    [['x', '--runs', '51'], '--runs must be a whole number from 1 to 50.'],
    [['x', '--status', 'exploded'], 'Status must be one of:'],
    [['x', '--level', 'loud'], 'Level must be one of:'],
    [
      ['x', '--git-branch', 'main', '--all-branches'],
      "Can't combine --git-branch with --all-branches.",
    ],
    [
      ['x', '--branch', 'main', '--all-branches'],
      "Can't combine --git-branch with --all-branches.",
    ],
    [
      ['x', '--branch', 'main', '--git-branch', 'feat'],
      "Can't use --branch with --git-branch. Use --git-branch.",
    ],
  ])('rejects %j', async (args, message) => {
    client.setArgv('ci', 'grep', ...args);
    const exitCode = await ci(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(message);
  });

  describe('--git-branch', () => {
    const DEPRECATED = '--branch is deprecated. Use --git-branch.';

    it('searches runs on the given Git branch', async () => {
      const listQuery = useRuns();
      useSearch({ invocations: [], hasMore: false });

      client.setArgv('ci', 'grep', 'oom', '--git-branch', 'feat');
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(listQuery().branchName).toBe('feat');
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });

    it('still accepts --branch, with a warning', async () => {
      const listQuery = useRuns();
      useSearch({ invocations: [], hasMore: false });

      client.setArgv('ci', 'grep', 'oom', '--branch=feat');
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(listQuery().branchName).toBe('feat');
      expect(client.stderr.getFullOutput()).toContain(`! ${DEPRECATED}`);
    });

    it('skips the warning with --json', async () => {
      const listQuery = useRuns();
      useSearch({ invocations: [], hasMore: false });

      client.setArgv('ci', 'grep', 'oom', '--branch', 'feat', '--json');
      const exitCode = await ci(client);

      expect(exitCode).toBe(0);
      expect(listQuery().branchName).toBe('feat');
      expect(client.stderr.getFullOutput()).not.toContain(DEPRECATED);
      expect(() => JSON.parse(client.stdout.getFullOutput())).not.toThrow();
    });

    it('sends no request when both names are given', async () => {
      let listed = false;
      client.scenario.get(LIST_PATH, (_req, res) => {
        listed = true;
        res.json({ invocations: [], repositories: {}, pagination: {} });
      });

      client.setArgv(
        'ci',
        'grep',
        'oom',
        '--branch',
        'main',
        '--git-branch',
        'feat'
      );
      const exitCode = await ci(client);

      expect(exitCode).toBe(2);
      expect(listed).toBe(false);
      expect(client.stderr.getFullOutput()).not.toContain(DEPRECATED);
    });
  });
});
