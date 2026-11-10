import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { buildCiCommand, ciDisplayText } from '../../util/ci/output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import stamp from '../../util/output/stamp';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { getCiInvocationTree, getLatestCiAttempt } from '../../util/ci/api';
import { isTerminalRunStatus } from '../../util/ci/run-status';
import { toDisplayRunId } from '../../util/ci/ids';
import { toRunView } from '../../util/ci/run-view';
import { CiRerunTelemetryClient } from '../../util/telemetry/commands/ci/rerun';
import { rerunSubcommand } from './command';
import { handleCiApiError, invalidCiArguments } from './errors';
import { printRunView } from './render';
import { resolveRunTarget } from './resolve-run';
import { CiWaitError, waitForRun } from './wait';

export default async function rerun(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CiRerunTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rerunSubcommand.options)
    );
  } catch (error) {
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;

  telemetry.trackCliArgumentRun(args[0]);
  telemetry.trackCliFlagWait(flags['--wait']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (args.length > 1) {
    return invalidCiArguments(
      client,
      `Pass at most 1 run ID. Usage: ${getCommandName('ci rerun [run]')}`
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidCiArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const target = await resolveRunTarget(client, args[0], undefined);
  if (typeof target === 'number') {
    return target;
  }
  const runId = toDisplayRunId(target.invocationId);
  const currentNext = [
    {
      command: buildCiCommand(client.argv, ['ci', 'inspect', runId]),
      when: 'Inspect the current attempt before deciding what to do next',
    },
  ];
  const unsupportedMessage =
    "Can't rerun this run. Only runs with a Vercel CI source can be rerun; deployment-native checks aren't supported.";
  const staleMessage =
    "Can't rerun this attempt because a newer attempt exists. Inspect the current attempt before deciding what to do next.";

  let sourceTree;
  try {
    sourceTree = await getCiInvocationTree(client, target.invocationId, {
      accountId: target.accountId,
    });
  } catch (err) {
    return handleCiApiError(client, 'fetch the source Vercel CI run', err);
  }
  const previous = toRunView(sourceTree).run;
  const source = sourceTree.invocation.source;
  if (!asJson) {
    printAlignedLabel('Repository', ciDisplayText(previous.repository));
    printAlignedLabel('Branch', ciDisplayText(previous.branch));
    printAlignedLabel('Commit', ciDisplayText(previous.commitSha));
    printAlignedLabel(
      'Previous status',
      `attempt ${previous.attempt} · ${previous.status}`
    );
  }
  if (source && source.type !== 'vercel-ci') {
    return reportFailure(client, asJson, {
      reason: AGENT_REASON.CI_RUN_NOT_RETRYABLE,
      message: unsupportedMessage,
      next: currentNext,
    });
  }
  if (!isTerminalRunStatus(previous.status)) {
    return reportFailure(client, asJson, {
      reason: AGENT_REASON.CI_RUN_IN_PROGRESS,
      message:
        "Can't rerun a run that hasn't finished. Wait for the current attempt to finish.",
      next: [
        {
          command: buildCiCommand(client.argv, [
            'ci',
            'inspect',
            runId,
            '--attempt',
            String(previous.attempt),
            '--wait',
          ]),
          when: 'Wait for the current attempt to finish',
        },
      ],
    });
  }
  if (
    !args[0] &&
    (previous.status === 'succeeded' || previous.status === 'skipped')
  ) {
    return reportFailure(client, asJson, {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      userActionRequired: true,
      message: `The run for HEAD is ${previous.status}. Pass its run ID explicitly to intentionally start another attempt.`,
      run: previous,
      next: [
        {
          command: buildCiCommand(client.argv, ['ci', 'rerun', runId]),
          when: 'Intentionally rerun this finished run',
        },
      ],
    });
  }

  let newAttempt: number;
  try {
    if (!asJson) {
      output.print('\n');
      output.spinner(`Starting a new attempt of run ${runId}…`);
    }
    // List results (and even the preview) may already be stale. Revalidate
    // immediately before the non-idempotent POST, never retry that mutation.
    const sourceAttempt = await getLatestCiAttempt(
      client,
      target.invocationId,
      target.accountId
    );
    if (sourceAttempt !== previous.attempt) {
      output.stopSpinner();
      return reportFailure(client, asJson, {
        reason: 'source_not_latest',
        message: staleMessage,
        next: currentNext,
      });
    }
    ({ attempt: newAttempt } = await client.fetch<{ attempt: number }>(
      `/v1/vercel-ci/invocations/${encodeURIComponent(target.invocationId)}/attempts/${sourceAttempt}/retry`,
      {
        method: 'POST',
        accountId: target.accountId,
        retry: { retries: 0 },
        bailOn429: true,
      }
    ));
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err) && err.status === 409) {
      if (err.code === 'retry_not_supported') {
        return reportFailure(client, asJson, {
          reason: AGENT_REASON.CI_RUN_NOT_RETRYABLE,
          message: unsupportedMessage,
          next: currentNext,
        });
      }
      if (err.code === 'source_not_latest') {
        return reportFailure(client, asJson, {
          reason: 'source_not_latest',
          message: staleMessage,
          next: currentNext,
        });
      }
      if (err.code === 'retry_not_allowed') {
        return reportFailure(client, asJson, {
          reason: AGENT_REASON.CI_RUN_IN_PROGRESS,
          message:
            "Can't rerun a run that hasn't finished. Inspect the current attempt before deciding what to do next.",
          next: currentNext,
        });
      }
    }
    return reportFailure(client, asJson, {
      reason: apiFailureReason(err),
      message: `Failed to start a new attempt of run ${runId}. The request wasn't retried; inspect the current attempt before trying another rerun.`,
      next: currentNext,
    });
  }
  output.stopSpinner();

  const started = { id: runId, attempt: newAttempt };
  const attemptArgs = ['ci', 'inspect', runId, '--attempt', String(newAttempt)];
  const inspectCommand = buildCiCommand(client.argv, [
    ...attemptArgs,
    '--wait',
  ]);
  const next = [
    {
      command: inspectCommand,
      when: 'Wait for the new attempt to finish',
    },
  ];
  if (!asJson) {
    printAlignedLabel('Started', `attempt ${newAttempt} of run ${runId}`, {
      gutter: '✓',
    });
  }

  if (!flags['--wait']) {
    if (asJson) {
      const payload = client.nonInteractive
        ? {
            status: AGENT_STATUS.OK,
            run: started,
            previousRun: previous,
            message: `Started attempt ${newAttempt} of run ${runId}.`,
            next,
          }
        : { run: started };
      client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      output.print(
        `\n  Wait for the new attempt to finish:\n  ${inspectCommand}\n`
      );
    }
    return 0;
  }

  const rerunStamp = stamp();
  let tree;
  try {
    const waitTarget = { ...target, attempt: newAttempt };
    tree = await getCiInvocationTree(client, target.invocationId, {
      attempt: newAttempt,
      accountId: target.accountId,
    });
    tree = await waitForRun(client, waitTarget, tree, asJson);
  } catch (err) {
    output.stopSpinner();
    return reportFailure(client, asJson, {
      reason: err instanceof CiWaitError ? err.reason : apiFailureReason(err),
      message: `Started attempt ${newAttempt} of run ${runId}, but failed to wait for it. ${err instanceof CiWaitError ? err.message : 'The attempt may still be running.'}`,
      run: started,
      next: [
        {
          command: buildCiCommand(client.argv, attemptArgs),
          when: 'Check the status of the new attempt without starting another',
        },
      ],
    });
  }
  output.stopSpinner();

  const view = toRunView(tree);
  const failed = view.run.status === 'failed';
  const completedNext = [
    {
      command: buildCiCommand(
        client.argv,
        failed
          ? ['ci', 'logs', runId, '--attempt', String(newAttempt), '--failed']
          : attemptArgs
      ),
      when: failed
        ? 'Show logs for the failed tasks'
        : 'Inspect the finished attempt',
    },
  ];
  if (asJson) {
    const payload = client.nonInteractive
      ? {
          status: failed ? AGENT_STATUS.ERROR : AGENT_STATUS.OK,
          ...(failed ? { reason: 'ci_run_failed' } : {}),
          message: `Attempt ${newAttempt} of run ${runId} ${view.run.status}.`,
          ...view,
          next: completedNext,
        }
      : view;
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    printRunView(view, rerunStamp());
    output.print(
      `\n  ${completedNext[0].when}:\n  ${completedNext[0].command}\n`
    );
  }
  return failed ? 1 : 0;
}

function apiFailureReason(err: unknown): string {
  if (isAPIError(err)) {
    if (err.status === 403) return AGENT_REASON.PERMISSION_DENIED;
    if (err.status === 404) return AGENT_REASON.CI_RUN_NOT_FOUND;
    if (err.status === 429) return AGENT_REASON.RATE_LIMITED;
  }
  return AGENT_REASON.API_ERROR;
}

function reportFailure(
  client: Client,
  asJson: boolean,
  failure: {
    status?: 'error' | 'action_required';
    reason: string;
    message: string;
    userActionRequired?: boolean;
    run?: { id: string; attempt: number };
    next: Array<{ command: string; when: string }>;
  }
): number {
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ status: AGENT_STATUS.ERROR, ...failure }, null, 2)}\n`
    );
  } else {
    output.fatal(failure.message);
    for (const step of failure.next) {
      output.print(`  ${step.when}:\n  ${step.command}\n`);
    }
  }
  return 1;
}
