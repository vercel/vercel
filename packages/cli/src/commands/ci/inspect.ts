import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import { buildCiCommand } from '../../util/ci/output';
import { AGENT_STATUS } from '../../util/agent-output-constants';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getCiInvocationTree } from '../../util/ci/api';
import { isTerminalRunStatus } from '../../util/ci/run-status';
import { toApiRunId } from '../../util/ci/ids';
import { toRunView, type CiRunView } from '../../util/ci/run-view';
import type { CiInvocationTree } from '../../util/ci/types';
import { CiInspectTelemetryClient } from '../../util/telemetry/commands/ci/inspect';
import { inspectSubcommand } from './command';
import { failCi, handleCiApiError, invalidCiArguments } from './errors';
import { printRunView } from './render';
import { CiWaitError, waitForRun } from './wait';
import { resolveRunTarget } from './resolve-run';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CiInspectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(inspectSubcommand.options)
    );
  } catch (error) {
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;

  telemetry.trackCliArgumentRun(args[0]);
  telemetry.trackCliOptionAttempt(flags['--attempt']);
  telemetry.trackCliFlagWait(flags['--wait']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (args.length > 1) {
    return invalidCiArguments(
      client,
      `Pass at most 1 run ID. Usage: ${getCommandName('ci inspect [run]')}`
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidCiArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const attempt = flags['--attempt'];
  if (attempt !== undefined && (!Number.isInteger(attempt) || attempt < 1)) {
    return invalidCiArguments(
      client,
      '--attempt must be a whole number of 1 or more.'
    );
  }

  const target = await resolveRunTarget(client, args[0], attempt);
  if (typeof target === 'number') {
    return target;
  }

  const inspectStamp = stamp();
  let tree: CiInvocationTree;
  try {
    if (!asJson) {
      output.spinner('Fetching Vercel CI run…');
    }
    tree = await getCiInvocationTree(client, target.invocationId, {
      attempt: target.attempt,
      accountId: target.accountId,
    });
    if (flags['--wait']) {
      try {
        tree = await waitForRun(client, target, tree, asJson);
      } catch (err) {
        if (!(err instanceof CiWaitError)) throw err;
        output.stopSpinner();
        const command = buildCiCommand(client.argv, [
          'ci',
          'inspect',
          toRunView(tree).run.id,
          '--attempt',
          String(tree.invocation.attempt),
        ]);
        const failure = {
          reason: err.reason,
          message: err.message,
          next: [{ command, when: 'Check the status of this attempt' }],
        };
        if (asJson) {
          client.stdout.write(
            `${JSON.stringify({ status: AGENT_STATUS.ERROR, ...failure }, null, 2)}\n`
          );
          return 1;
        }
        const exitCode = failCi(client, failure);
        output.print(`  ${command}\n`);
        return exitCode;
      }
    }
  } catch (err) {
    output.stopSpinner();
    return handleCiApiError(client, 'fetch the Vercel CI run', err);
  }
  output.stopSpinner();

  const view = toRunView(tree);
  const next = getNextSteps(client, view, tree.invocation.source);
  const failedWait = flags['--wait'] && view.run.status === 'failed';

  if (asJson) {
    const payload = client.nonInteractive
      ? {
          status: failedWait ? AGENT_STATUS.ERROR : AGENT_STATUS.OK,
          message: `The Vercel CI run ${view.run.status}.`,
          ...(failedWait ? { reason: 'ci_run_failed' } : {}),
          ...view,
          next,
        }
      : view;
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    printRunView(view, inspectStamp());
    for (const step of next) {
      output.log(`${step.when}: ${chalk.cyan(step.command)}`);
    }
  }

  // Skipped attempts are intentional no-ops, not failures, including --wait.
  return failedWait ? 1 : 0;
}

function getNextSteps(
  client: Client,
  view: CiRunView,
  source: { type: string } | undefined
): Array<{ command: string; when: string }> {
  if (!toApiRunId(view.run.id)) {
    return [];
  }
  const attemptArgs = ['--attempt', String(view.run.attempt)];
  if (!isTerminalRunStatus(view.run.status)) {
    return [
      {
        command: buildCiCommand(client.argv, [
          'ci',
          'inspect',
          view.run.id,
          '--wait',
          ...attemptArgs,
        ]),
        when: 'Wait for this run to finish',
      },
    ];
  }
  if (view.run.status === 'failed') {
    return [
      {
        command: buildCiCommand(client.argv, [
          'ci',
          'logs',
          view.run.id,
          '--failed',
          ...attemptArgs,
        ]),
        when: 'Show logs for the failed tasks',
      },
      ...(source?.type === 'vercel-ci'
        ? [
            {
              command: buildCiCommand(client.argv, [
                'ci',
                'rerun',
                view.run.id,
              ]),
              when: 'Start a new attempt of this run',
            },
          ]
        : []),
    ];
  }
  return [];
}
