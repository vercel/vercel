import { z } from 'zod';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { printError } from '../../util/error';
import { getErrorRecovery } from '../../util/error-recovery';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import type Client from '../../util/client';
import { DEFAULT_WINDOW } from './command';
import type { LogsSourceName } from './sources';
import { sanitize } from './render';
import type { JsonErrorPayload } from './json-output';

const issuesSchema = z.array(
  z.object({ path: z.string(), message: z.string() })
);

const REQUESTS_ACCESS_MESSAGE =
  'CDN request logs require Observability Plus, a Priority project, or the Enterprise Agents & Apps entitlement.';

/**
 * A logs failure described once for both output modes. `human` is the stderr
 * text; `json` is the error document, without progress data.
 */
export interface LogsFailure {
  readonly human: string;
  readonly json: JsonErrorPayload;
  readonly exitCode: number;
}

/**
 * Describes an observability API failure. The API owns filter validation,
 * product access, and retention, so its messages are preserved and only
 * paired with a CLI hint for the relevant option.
 */
export function describeLogsApiError(
  client: Client,
  err: unknown,
  source: LogsSourceName
): LogsFailure | undefined {
  if (!isAPIError(err)) {
    return undefined;
  }

  const serverMessage = sanitize(err.serverMessage || err.message);
  const recovery = getErrorRecovery(err, client);
  const base = {
    status: 'error' as const,
    ...recovery,
    data: {
      httpStatus: err.status,
      serverMessage,
      ...(typeof err.code === 'string' ? { code: err.code } : {}),
    },
  };

  if (err.status === 402) {
    const human =
      source === 'requests'
        ? `${REQUESTS_ACCESS_MESSAGE}\n${serverMessage}`
        : serverMessage;
    return {
      human,
      json: {
        ...base,
        reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
        message:
          source === 'requests'
            ? REQUESTS_ACCESS_MESSAGE
            : "The selected team can't query runtime logs for this window.",
      },
      exitCode: 1,
    };
  }

  const issues = issuesSchema.safeParse(err.issues);
  if (err.status === 400 && issues.success && issues.data.length > 0) {
    const messages = issues.data.map(issue => sanitize(issue.message));
    const timeIssue = issues.data.some(issue =>
      issue.path.startsWith('timeRange')
    );
    const hint = timeIssue
      ? 'Adjust --since or --until.'
      : `See ${getCommandNamePlain(`logs ${source} --help`)} for supported filter forms.`;
    const humanHint = timeIssue
      ? hint
      : `See ${getCommandName(`logs ${source} --help`)} for supported filter forms.`;
    return {
      human: `${source}: ${messages.join('; ')}\n${humanHint}`,
      json: {
        ...base,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `The ${source} query was rejected.`,
        hint,
        data: {
          ...base.data,
          issues: issues.data.map(issue => ({
            field: issue.path,
            reason: 'invalid',
            message: sanitize(issue.message),
          })),
        },
      },
      exitCode: 2,
    };
  }

  if (err.status === 400 && /time range|retain/i.test(serverMessage)) {
    const hint = `Use a later --since, or omit it to search the last ${DEFAULT_WINDOW}.`;
    return {
      human: `${serverMessage}\n${hint}`,
      json: {
        ...base,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'The requested time range is outside the available retention.',
        hint,
      },
      exitCode: 2,
    };
  }

  if (err.status === 403) {
    return {
      human: serverMessage,
      json: {
        ...base,
        reason: AGENT_REASON.PERMISSION_DENIED,
        message: `You don't have access to ${source} logs for this project.`,
      },
      exitCode: 1,
    };
  }

  if (err.status === 400) {
    return {
      human: serverMessage,
      json: {
        ...base,
        reason: AGENT_REASON.API_ERROR,
        message: `The API rejected the ${source} query.`,
      },
      exitCode: 1,
    };
  }

  if (err.status === 429) {
    return {
      human: serverMessage,
      json: {
        ...base,
        reason: AGENT_REASON.RATE_LIMITED,
        message: `Couldn't retrieve ${source} logs: the request limit was reached.`,
      },
      exitCode: 1,
    };
  }

  return {
    human: serverMessage,
    json: {
      ...base,
      reason: AGENT_REASON.API_ERROR,
      message: `Couldn't retrieve ${source} logs.`,
    },
    exitCode: 1,
  };
}

/** Prints an observability API failure on stderr (human mode). */
export function printLogsApiError(
  client: Client,
  err: unknown,
  source: LogsSourceName
): void {
  const failure = describeLogsApiError(client, err, source);
  if (!failure) {
    printError(err);
    return;
  }
  // Unexpected API failures keep the shared formatter, which includes the
  // status code.
  const status = isAPIError(err) ? err.status : undefined;
  if (
    (failure.json.reason === AGENT_REASON.API_ERROR && status !== 400) ||
    failure.json.reason === AGENT_REASON.RATE_LIMITED
  ) {
    printError(err);
    return;
  }
  output.error(failure.human);
}
