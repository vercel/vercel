import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Client from '../../../../src/util/client';
import type { CiInvocationTreeEvent } from '../../../../src/util/ci/api';
import type { CiInvocationTree } from '../../../../src/util/ci/types';
import { waitForRun } from '../../../../src/commands/ci/wait';
import { createCiTree } from '../../../mocks/ci';

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  spinner: vi.fn(),
  stopSpinner: vi.fn(),
}));
vi.mock('../../../../src/util/ci/api', () => ({
  streamCiInvocationTree: mocks.stream,
}));
vi.mock('../../../../src/output-manager', () => ({
  default: {
    spinner: mocks.spinner,
    stopSpinner: mocks.stopSpinner,
    log: vi.fn(),
    debug: vi.fn(),
  },
}));

const initial = {
  invocation: {
    invocationId: 'invo1_wait',
    attempt: 1,
    status: 'running',
    ref: 'refs/heads/main',
    createdAt: 1,
    repositoryKey: 'github:test/repo',
    commitSha: 'abc123',
    teamId: 'team_1',
    setupConclusion: { result: 'succeeded' },
  },
  jobs: [],
  repositories: {},
} as unknown as CiInvocationTree;
const client = {} as Client;
const target = { invocationId: 'invo1_wait', accountId: 'team_1' };
const tree = { type: 'tree', ...initial } as CiInvocationTreeEvent;
const timeout = { type: 'end', reason: 'timeout' } as CiInvocationTreeEvent;
const completed = {
  type: 'tree',
  ...initial,
  invocation: {
    ...initial.invocation,
    completed: { completedAt: 1, conclusion: 'succeeded' },
  },
} as CiInvocationTreeEvent;

const invalidFields: Array<[string, unknown]> = [
  ['invocation.invocationId', 'invo1_other'],
  ['invocation.attempt', 2],
  ['invocation.teamId', 'team_other'],
  ['invocation.status', 'invalid-status'],
  ['invocation.runConclusion.result', 'invalid-result'],
  ['invocation.completed.conclusion', 'invalid-result'],
  ['invocation.setupConclusion.result', 'invalid-result'],
  ['invocation.runConclusion', {}],
  ['invocation.completed', {}],
  ['invocation', null],
  ['invocation.invocationId', ''],
  ['invocation.attempt', 1.5],
  ['invocation.createdAt', '2026-01-01'],
  ['invocation.createdAt', NaN],
  ['invocation.createdAt', Infinity],
  ['invocation.createdAt', 1e20],
  ['invocation.ref', undefined],
  ['invocation.commitSha', 123],
  ['invocation.skipped', { reason: 123 }],
  ['repositories', null],
  ['repositories.ownr1_test:repo1_test.owner', 123],
  ['jobs', {}],
  ['jobs.0', null],
  ['jobs.0.definition', {}],
  ['jobs.0.definition.jobDefinitionId', ''],
  ['jobs.0.definition.kind', 'invalid-kind'],
  ['jobs.0.definition.name', undefined],
  ['jobs.0.definition.command', 123],
  ['jobs.0.run', {}],
  ['jobs.0.run.attempt', 0],
  ['jobs.0.run.started.startedAt', 'yesterday'],
  [
    'jobs.0.run.completed',
    { completedAt: 1, conclusion: { result: 'cached' } },
  ],
  ['jobs.0.tasks', null],
  ['jobs.0.tasks.0', null],
  ['jobs.0.tasks.0.definition', {}],
  ['jobs.0.tasks.0.definition.taskDefinitionId', ''],
  ['jobs.0.tasks.0.definition.name', undefined],
  ['jobs.0.tasks.0.definition.jobRunAttempt', -1],
  ['jobs.0.tasks.0.definition.dependencyTaskDefinitionIds', [123]],
  ['jobs.0.tasks.0.run', {}],
  ['jobs.0.tasks.0.run.completed.completedAt', Infinity],
  ['jobs.0.tasks.0.run.completed.conclusion.result', 'invalid-result'],
  ['jobs.0.tasks.0.run.completed.conclusion.reason', 123],
];

function invalidTree(path: string, value: unknown): CiInvocationTree {
  const next = structuredClone(
    createCiTree({ invocation: initial.invocation })
  );
  const keys = path.split('.');
  let object = next as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    object = object[key] as Record<string, unknown>;
  }
  object[keys[keys.length - 1]] = value;
  return next;
}

function responses(events: unknown[][]) {
  let calls = 0;
  const teardown = vi.fn();
  mocks.stream.mockImplementation(async function* () {
    try {
      for (const event of events[Math.min(calls++, events.length - 1)])
        yield event;
    } finally {
      teardown();
    }
  });
  return teardown;
}

describe('CI wait stream boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { events: [] },
    { events: [tree] },
  ])('bounds unexpected EOF regardless of valid progress (%j)', async ({
    events,
  }) => {
    const teardown = responses([events]);
    const waiting = expect(
      waitForRun(client, target, initial, true)
    ).rejects.toMatchObject({ reason: 'ci_wait_interrupted' });
    await vi.advanceTimersByTimeAsync(4000);
    await waiting;
    expect(mocks.stream).toHaveBeenCalledTimes(3);
    expect(teardown).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not reset prior failures on timeout-only responses', async () => {
    responses([[], [timeout], [], [timeout], []]);
    const waiting = expect(
      waitForRun(client, target, initial, true)
    ).rejects.toMatchObject({ reason: 'ci_wait_interrupted' });
    await vi.advanceTimersByTimeAsync(8000);
    await waiting;
    expect(mocks.stream).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('permits explicit protocol timeouts and tears down immediately on terminal trees', async () => {
    const teardown = responses([
      [tree, timeout],
      [timeout],
      [timeout],
      [completed, timeout],
    ]);
    const waiting = waitForRun(client, target, initial, false);
    await vi.advanceTimersByTimeAsync(6000);
    expect((await waiting).invocation.completed).toBeDefined();
    expect(mocks.stream).toHaveBeenCalledTimes(4);
    expect(teardown).toHaveBeenCalledTimes(4);
    expect(mocks.stopSpinner).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects malformed events and trees without treating them as timeout progress', async () => {
    responses([
      [
        {
          type: 'tree',
          invocation: { ...initial.invocation, ref: undefined },
          jobs: [],
        },
      ],
      [{ type: 'end', reason: 'unexpected' }],
      [null],
    ]);
    const waiting = expect(
      waitForRun(client, target, initial, true)
    ).rejects.toMatchObject({ reason: 'ci_wait_interrupted' });
    await vi.advanceTimersByTimeAsync(4000);
    await waiting;
    expect(mocks.stream).toHaveBeenCalledTimes(3);
    expect(mocks.spinner).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(
    invalidFields
  )('bounds invalid terminal stream trees (%s = %j)', async (path, value) => {
    const teardown = responses([
      [{ type: 'tree', ...invalidTree(path, value) }, timeout],
    ]);
    const waiting = expect(
      waitForRun(client, target, initial, true)
    ).rejects.toMatchObject({ reason: 'ci_wait_interrupted' });
    await vi.advanceTimersByTimeAsync(4000);
    await waiting;
    expect(mocks.stream).toHaveBeenCalledTimes(3);
    expect(teardown).toHaveBeenCalledTimes(3);
    expect(mocks.spinner).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(
    invalidFields
  )('validates initial trees before returning or streaming (%s = %j)', async (path, value) => {
    await expect(
      waitForRun(
        client,
        { ...target, attempt: 1 },
        invalidTree(path, value),
        true
      )
    ).rejects.toThrow('Invalid Vercel CI run tree.');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    true,
    false,
  ])('recovers from an invalid terminal tree without accepting it (JSON: %s)', async asJson => {
    const teardown = responses([
      [{ type: 'tree', ...invalidTree('invocation.attempt', 2) }, timeout],
      [completed],
    ]);
    const waiting = waitForRun(client, target, initial, asJson);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await waiting).invocation.attempt).toBe(1);
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    expect(teardown).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pins the team to the initial response when the target has no accountId', async () => {
    responses([
      [{ type: 'tree', ...invalidTree('invocation.teamId', 'team_other') }],
    ]);
    const waiting = expect(
      waitForRun(client, { invocationId: target.invocationId }, initial, true)
    ).rejects.toMatchObject({ reason: 'ci_wait_interrupted' });
    await vi.advanceTimersByTimeAsync(4000);
    await waiting;
    expect(mocks.stream).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'new',
    'running',
    'bootstrapping',
    'snapshotted',
    'sandbox_named',
    'jobs_on_hive_clone_dispatched',
    'jobs_on_hive_dispatched',
    'jobs_on_hive_completed',
    'awaiting_jobs',
  ])('accepts valid nonterminal statuses and full completed fixtures (%s)', async status => {
    const running = createCiTree({ running: true, invocation: { status } });
    const finished = createCiTree();
    responses([
      [
        { type: 'tree', ...running },
        { type: 'tree', ...finished },
      ],
    ]);
    await expect(
      waitForRun(
        client,
        { invocationId: running.invocation.invocationId },
        running,
        true
      )
    ).resolves.toEqual(finished);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    true,
    false,
  ])('accepts a terminal tree without an end event for the pinned attempt (JSON: %s)', async asJson => {
    const running = createCiTree({
      running: true,
      invocation: { attempt: 2 },
    });
    const finished = createCiTree({ invocation: { attempt: 2 } });
    const teardown = responses([[{ type: 'tree', ...finished }]]);
    const scopedClient = {
      config: { currentTeam: 'team_unrelated' },
    } as Client;
    const expectedTarget = {
      invocationId: running.invocation.invocationId,
      attempt: 2,
    };
    await expect(
      waitForRun(scopedClient, expectedTarget, running, asJson)
    ).resolves.toEqual(finished);
    expect(mocks.stream).toHaveBeenCalledWith(
      scopedClient,
      expectedTarget.invocationId,
      expect.objectContaining({ attempt: 2, accountId: undefined })
    );
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'succeeded',
    'failed',
    'skipped',
  ] as const)('accepts valid terminal invocation conclusions (%s)', async result => {
    const finished = createCiTree({
      invocation: {
        completed: { completedAt: 1, conclusion: result },
        runConclusion: { result },
      },
    });
    await expect(
      waitForRun(
        client,
        { invocationId: finished.invocation.invocationId },
        finished,
        true
      )
    ).resolves.toBe(finished);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'succeeded',
    'cached',
    'failed',
    'skipped',
  ] as const)('accepts valid task conclusions (%s)', async result => {
    const finished = createCiTree({
      taskConclusion: { result, reason: 'test' },
    });
    responses([[{ type: 'tree', ...finished }]]);
    await expect(
      waitForRun(
        client,
        { invocationId: finished.invocation.invocationId },
        createCiTree({ running: true }),
        true
      )
    ).resolves.toEqual(finished);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'completed',
    'skipped',
    'bootstrapping_failed',
    'jobs_on_hive_failed',
  ])('accepts terminal statuses without run conclusions and empty jobs (%s)', async status => {
    const finished = createCiTree({
      invocation: {
        status,
        completed: undefined,
        runConclusion: undefined,
      },
    });
    finished.jobs = [];
    await expect(
      waitForRun(
        client,
        { invocationId: finished.invocation.invocationId },
        finished,
        true
      )
    ).resolves.toBe(finished);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows absent step runs, empty tasks, optional completed conclusion and extra backend fields', async () => {
    const finished = createCiTree({
      invocation: {
        completed: { completedAt: 1 },
        runConclusion: undefined,
      },
    });
    finished.jobs[0].run = undefined;
    finished.jobs[0].tasks[0].run = undefined;
    finished.jobs.push({ ...finished.jobs[0], tasks: [] });
    const withExtra = { ...finished, backendMetadata: { version: 1 } };
    responses([[{ type: 'tree', ...withExtra }]]);
    const result = await waitForRun(
      client,
      { invocationId: finished.invocation.invocationId },
      createCiTree({ running: true }),
      true
    );
    expect(result).toEqual(withExtra);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a stalled read at the overall deadline and clears timers and spinner', async () => {
    const teardown = vi.fn();
    let signal: AbortSignal | undefined;
    mocks.stream.mockImplementation(async function* (
      _client,
      _id,
      options: { signal: AbortSignal }
    ) {
      signal = options.signal;
      try {
        await new Promise<void>(resolve =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        );
      } finally {
        teardown();
      }
    });
    const waiting = expect(
      waitForRun(client, target, initial, false)
    ).rejects.toMatchObject({ reason: 'ci_wait_timeout' });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await waiting;
    expect(signal?.aborted).toBe(true);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(mocks.stopSpinner).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
