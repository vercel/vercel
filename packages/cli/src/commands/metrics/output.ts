import stripAnsi from 'strip-ansi';
import type Client from '../../util/client';
import output from '../../output-manager';
import { clientObservabilityPlanRecovery } from '../../util/metrics/plan-gate';
import {
  getErrorRecovery,
  type ErrorRecovery,
} from '../../util/error-recovery';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import {
  agentErrorMetadata,
  trackAgentError,
} from '../../util/telemetry/agent-error';
import type { QueryMetadata, MetricsQueryResponse } from './types';
import {
  withWarnings,
  type DeprecatedOptionWarning,
} from '../../util/renamed-option';

export function getRollupColumnName(
  metric: string,
  aggregation: string
): string {
  // Aggregations can carry a field (e.g. `unique/visitor_id`); the API
  // flattens both dots and slashes to underscores in column names.
  return `${metric}_${aggregation}`.replace(/[./]/g, '_');
}

export function getResolvedOrderMetadata(
  query: Pick<QueryMetadata, 'orderBy' | 'orderDirection'>,
  response: Pick<MetricsQueryResponse, 'orderBy' | 'orderDirection'>
): Pick<QueryMetadata, 'orderBy' | 'orderDirection'> {
  const orderBy = query.orderBy ?? (response.orderBy ? 'count' : undefined);
  const orderDirection = response.orderDirection ?? query.orderDirection;

  return {
    ...(orderBy ? { orderBy } : {}),
    ...(orderDirection ? { orderDirection } : {}),
  };
}

export function formatQueryJson(
  query: QueryMetadata,
  response: MetricsQueryResponse,
  warnings: ReadonlyArray<DeprecatedOptionWarning | undefined> = []
): string {
  const orderMetadata = getResolvedOrderMetadata(query, response);
  const queryWithResponseMetadata: QueryMetadata = {
    ...query,
    ...orderMetadata,
  };

  return JSON.stringify(
    withWarnings(
      {
        query: queryWithResponseMetadata,
        summary: response.summary ?? [],
        data: response.data ?? [],
        ...orderMetadata,
      },
      warnings
    ),
    null,
    2
  );
}

export function formatErrorJson(
  code: string,
  message: string,
  allowedValues?: string[],
  recovery: ErrorRecovery & {
    next?: Array<{ command: string; when?: string }>;
    cliVersion?: string;
    invocationId?: string;
  } = {}
): string {
  const error: { code: string; message: string; allowedValues?: string[] } = {
    code,
    message,
  };
  if (allowedValues && allowedValues.length > 0) {
    error.allowedValues = allowedValues;
  }
  return JSON.stringify({ error: { ...error, ...recovery } }, null, 2);
}

function projectSelectorFromArgv(argv: string[]): string | undefined {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--project=')) {
      return arg.slice('--project='.length);
    }
    if (arg === '--project' && i + 1 < args.length) {
      return args[i + 1];
    }
  }
}

/** True when the hint is only the command `next` already prints. */
function hintRestatesCommand(
  hint: string,
  steps: Array<{ command: string }> | undefined
): boolean {
  if (!steps?.length) return false;
  const plain = stripAnsi(hint).replace(/`/g, '').trim();
  return steps.some(step => {
    const command = step.command.trim();
    return command === plain || command.startsWith(`${plain} `);
  });
}

export function handleApiError(
  err: {
    status: number;
    code?: string;
    serverMessage?: string;
    allowedValues?: string[];
    retryAfterMs?: number | 'never';
    action?: string;
    resource?: string;
    meta?: { reason?: string };
  },
  jsonOutput: boolean,
  client: Client,
  overrides: Partial<Record<number, { code?: string; message: string }>> = {},
  target: { scope?: string; projectName?: string } = {}
): number {
  let code: string;
  let message: string;

  const override = overrides[err.status];
  if (override) {
    code = override.code || err.code || 'BAD_REQUEST';
    message = override.message;
  } else {
    switch (err.status) {
      case 402:
        code = err.code || 'PAYMENT_REQUIRED';
        message =
          err.serverMessage ||
          'This feature requires an Observability Plus subscription.';
        break;
      case 429:
        code = err.code || 'RATE_LIMITED';
        message =
          err.serverMessage ||
          'You have reached the metrics query rate limit. Please wait and try again. If you need a higher limit, request one from your Vercel account team.';
        break;
      case 403:
        code = 'FORBIDDEN';
        message =
          err.serverMessage && err.serverMessage !== 'Response Error'
            ? err.serverMessage
            : 'You do not have permission to query metrics for this project/team.';
        break;
      case 500:
        code = 'INTERNAL_ERROR';
        message = 'An internal error occurred. Please try again later.';
        break;
      case 504:
        code = 'TIMEOUT';
        message =
          'The query timed out. Try a shorter time range or fewer groups.';
        break;
      case 400:
        code = err.code || 'BAD_REQUEST';
        message = err.serverMessage || `API error (${err.status})`;
        break;
      default:
        code = err.code || 'BAD_REQUEST';
        message = err.serverMessage || `API error (${err.status})`;
    }
  }

  const billing =
    err.status === 402
      ? clientObservabilityPlanRecovery(
          client,
          err,
          message,
          target.projectName ?? projectSelectorFromArgv(client.argv),
          target.scope
        )
      : undefined;
  // The shared hint names the same commands unscoped; use the one that
  // matches `next` so a person is not told to buy on another team.
  const recovery: ErrorRecovery = {
    ...getErrorRecovery({ ...err, serverMessage: message }, client),
    ...(billing && { hint: billing.hint }),
  };
  const next = billing?.command
    ? [
        {
          command: buildCommandWithGlobalFlags(
            client.argv.filter(
              arg => !/^(?:--yes|--force|-y)(?:=|$)/.test(arg)
            ),
            billing.command,
            undefined,
            {
              excludeFlags: billing.excludeFlags,
              preserveProject: billing.preserveProject,
            }
          ),
          when: billing.when,
        },
      ]
    : undefined;
  if (recovery.hint && hintRestatesCommand(recovery.hint, next)) {
    delete recovery.hint;
  }
  const details = {
    ...recovery,
    ...(next && { next }),
    ...agentErrorMetadata(client),
  };
  trackAgentError(client, {
    reason:
      err.status === 403
        ? 'forbidden'
        : err.status === 402
          ? 'payment_required'
          : err.status === 429
            ? 'rate_limited'
            : code,
    ...recovery,
  });
  if (jsonOutput || client.nonInteractive) {
    client.stdout.write(
      formatErrorJson(code, message, err.allowedValues, details)
    );
  } else {
    output.fatal(message);
    if (recovery.hint) output.print(`  ${recovery.hint}\n`);
    for (const step of next ?? []) output.print(`  ${step.command}\n`);
    if (err.allowedValues && err.allowedValues.length > 0) {
      output.print(`\nAvailable values: ${err.allowedValues.join(', ')}\n`);
    }
  }
  return 1;
}
