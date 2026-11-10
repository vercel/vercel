import { z } from 'zod';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import output from '../../output-manager';
import { streamCiInvocationTree } from '../../util/ci/api';
import { getRunStatus, isTerminalRunStatus } from '../../util/ci/run-status';
import { countTasks, toRunView } from '../../util/ci/run-view';
import type { CiInvocationTree } from '../../util/ci/types';
import type { CiRunTarget } from './resolve-run';

const MAX_STREAM_FAILURES = 3;
const STREAM_RETRY_DELAY_MS = 2000;
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;

const id = z.string().min(1);
const attemptNumber = z.number().int().positive();
const timestamp = z
  .number()
  .refine(value => Number.isFinite(new Date(value).getTime()));
const conclusionResult = z.enum(['succeeded', 'failed', 'skipped']);
const conclusion = z.object({ result: conclusionResult });
const stepConclusion = z.object({
  result: conclusionResult,
  reason: z.string().optional(),
});
const stepRun = z.object({
  attempt: attemptNumber,
  createdAt: timestamp,
  started: z.object({ startedAt: timestamp }).optional(),
});
const treeSchema = z.object({
  invocation: z.object({
    invocationId: id,
    attempt: attemptNumber,
    teamId: id,
    createdAt: timestamp,
    repositoryKey: id,
    ref: z.string(),
    commitSha: z.string(),
    // `running` is also used by existing CLI callers/fixtures.
    status: z.enum([
      'new',
      'running',
      'bootstrapping',
      'bootstrapping_failed',
      'snapshotted',
      'sandbox_named',
      'jobs_on_hive_clone_dispatched',
      'jobs_on_hive_dispatched',
      'jobs_on_hive_completed',
      'jobs_on_hive_failed',
      'awaiting_jobs',
      'completed',
      'skipped',
    ]),
    skipped: z.object({ reason: z.string() }).optional(),
    completed: z
      .object({
        completedAt: timestamp,
        conclusion: conclusionResult.optional(),
      })
      .optional(),
    runConclusion: conclusion.optional(),
    setupConclusion: conclusion.optional(),
  }),
  repositories: z.record(
    z.string(),
    z.object({ owner: z.string(), name: z.string() })
  ),
  jobs: z.array(
    z.object({
      definition: z.object({
        jobDefinitionId: id,
        kind: z.enum(['command', 'turbo']),
        name: z.string(),
        command: z.string(),
        createdAt: timestamp,
      }),
      run: stepRun
        .extend({
          jobDefinitionId: id,
          completed: z
            .object({ completedAt: timestamp, conclusion: stepConclusion })
            .optional(),
        })
        .optional(),
      tasks: z.array(
        z.object({
          definition: z.object({
            jobDefinitionId: id,
            jobRunAttempt: attemptNumber,
            taskDefinitionId: id,
            name: z.string(),
            dependencyTaskDefinitionIds: z.array(id),
            createdAt: timestamp,
          }),
          run: stepRun
            .extend({
              taskDefinitionId: id,
              completed: z
                .object({
                  completedAt: timestamp,
                  conclusion: stepConclusion.extend({
                    result: z.enum([
                      'succeeded',
                      'cached',
                      'failed',
                      'skipped',
                    ]),
                  }),
                })
                .optional(),
            })
            .optional(),
        })
      ),
    })
  ),
});

function validateTree(
  tree: unknown,
  expected: { invocationId: string; attempt?: number; teamId?: string }
): asserts tree is CiInvocationTree {
  // Check, but retain the original response (including unknown backend fields).
  const parsed = treeSchema.safeParse(tree);
  if (
    !parsed.success ||
    parsed.data.invocation.invocationId !== expected.invocationId ||
    parsed.data.invocation.attempt !== expected.attempt ||
    parsed.data.invocation.teamId !== expected.teamId
  ) {
    throw new Error('Invalid Vercel CI run tree.');
  }
}

export class CiWaitError extends Error {
  constructor(
    public readonly reason: 'ci_wait_timeout' | 'ci_wait_interrupted'
  ) {
    super(
      reason === 'ci_wait_timeout'
        ? 'Stopped waiting after 10 minutes. The run may still be running.'
        : 'Failed to wait for the Vercel CI run after 3 interrupted streams. The run may still be running.'
    );
  }
}

/**
 * Streams the run's tree until the attempt finishes. Protocol timeouts may
 * reconnect, but incomplete streams are bounded and all waiting has a deadline.
 */
export async function waitForRun(
  client: Client,
  target: CiRunTarget,
  initial: CiInvocationTree,
  asJson: boolean
): Promise<CiInvocationTree> {
  const expected = {
    invocationId: target.invocationId,
    attempt: target.attempt ?? initial.invocation?.attempt,
    // Team resolution may leave accountId unset. Do not use the client's account:
    // the initial response then establishes the team for subsequent updates.
    teamId: target.accountId ?? initial.invocation?.teamId,
  };
  validateTree(initial, expected);
  if (isTerminalRunStatus(getRunStatus(initial.invocation))) return initial;

  let tree = initial;
  const attempt = initial.invocation.attempt;
  const controller = new AbortController();
  const timeoutError = new CiWaitError('ci_wait_timeout');
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError);
      controller.abort();
    }, WAIT_TIMEOUT_MS);
  });
  const updateSpinner = () => {
    if (asJson) return;
    const { total, finished } = countTasks(toRunView(tree));
    const progress = total > 0 ? ` ${finished} of ${total} tasks finished` : '';
    output.spinner(`Waiting for the run to finish…${progress}`);
  };

  if (!asJson) {
    output.stopSpinner();
    output.log(
      'Waiting for the run to finish (up to 10 minutes). Press Ctrl+C to stop waiting; the run keeps going.'
    );
  }

  const follow = async () => {
    let failures = 0;
    let incompleteStreams = 0;
    while (!controller.signal.aborted) {
      updateSpinner();
      let timedOut = false;
      let validTree = false;
      try {
        for await (const event of streamCiInvocationTree(
          client,
          target.invocationId,
          { attempt, accountId: target.accountId, signal: controller.signal }
        )) {
          if (controller.signal.aborted) throw timeoutError;
          if (!event || typeof event !== 'object') {
            throw new Error('Invalid Vercel CI run stream event.');
          }
          if (event.type === 'tree') {
            const { type: _type, ...next } = event;
            // Validate before accessing the tree or resetting retry state.
            validateTree(next, expected);
            // Exercise the same processing used for progress in JSON mode too.
            countTasks(toRunView(next));
            tree = next;
            validTree = true;
            if (isTerminalRunStatus(getRunStatus(tree.invocation))) return tree;
            updateSpinner();
          } else if (event.type === 'end' && event.reason === 'timeout') {
            timedOut = true;
            break;
          } else {
            throw new Error('Vercel CI run stream ended without completion.');
          }
        }
      } catch (err) {
        if (controller.signal.aborted) throw timeoutError;
        if (isAPIError(err)) throw err;
        output.debug(`Vercel CI run stream interrupted: ${err}`);
      }
      if (timedOut) {
        // An explicit protocol timeout may reconnect until the overall deadline.
        // Timeout-only responses are not evidence of valid tree processing.
        if (validTree) failures = 0;
      } else if (
        ++failures >= MAX_STREAM_FAILURES ||
        ++incompleteStreams >= MAX_STREAM_FAILURES
      ) {
        // Progress before an unexpected EOF must not allow endless reconnects.
        throw new CiWaitError('ci_wait_interrupted');
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(retryTimer);
          reject(timeoutError);
        };
        const retryTimer = setTimeout(() => {
          controller.signal.removeEventListener('abort', onAbort);
          resolve();
        }, STREAM_RETRY_DELAY_MS);
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      });
    }
    throw timeoutError;
  };

  try {
    // Race as well as abort: a stalled stream must not hold the command open.
    return await Promise.race([follow(), deadline]);
  } finally {
    clearTimeout(timer!);
    controller.abort();
    if (!asJson) output.stopSpinner();
  }
}
