import type Client from '../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  type AgentErrorPayload,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import { quoteArg } from '../../util/flags/quote-arg';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';

interface ScheduleErrorDetails {
  reason: AgentErrorPayload['reason'];
  message: string;
  retryable?: boolean;
  retryAfterMs?: number;
  userActionRequired?: boolean;
  next?: AgentErrorPayload['next'];
}

interface ScheduleErrorContext {
  action:
    | 'create'
    | 'get'
    | 'list'
    | 'list-executions'
    | 'update'
    | 'enable'
    | 'disable'
    | 'invoke'
    | 'delete';
  namespace: string;
  name?: string;
  local?: boolean;
  /** Track selector arguments, from `scheduleTrackArgs`. */
  trackArgs?: string[];
}

function asSentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function apiErrorDetail(error: { serverMessage?: string }): string | undefined {
  const message = error.serverMessage?.trim();
  return message && message !== 'Response Error'
    ? asSentence(message)
    : undefined;
}

function requestDescription(context: ScheduleErrorContext): string {
  if (context.action === 'list') {
    return `list schedules in namespace ${context.namespace}`;
  }
  if (context.action === 'list-executions') {
    return `list executions for schedule ${context.namespace}/${context.name}`;
  }
  return `${context.action} schedule ${context.namespace}/${context.name}`;
}

function ambiguousInvokeError(local?: boolean): ScheduleErrorDetails {
  return {
    reason: AGENT_REASON.API_ERROR,
    message:
      'The schedule invocation may have been accepted, but the CLI did not receive confirmation. Check whether the schedule ran before invoking it again.' +
      (local
        ? ` Inspect the ${getCommandName('dev')} output for local executions.`
        : ''),
    retryable: false,
    userActionRequired: true,
  };
}

function getSchedulesError(
  client: Client,
  error: unknown,
  context: ScheduleErrorContext
): ScheduleErrorDetails {
  if (!isAPIError(error)) {
    if (context.action === 'invoke') {
      return ambiguousInvokeError(context.local);
    }
    if (context.local) {
      return {
        reason: AGENT_REASON.API_ERROR,
        message: `${error instanceof Error ? asSentence(error.message) : 'Failed to connect to local Schedules.'} Check the local session and restart ${getCommandName('dev')} in this project if needed.`,
        retryable: false,
        userActionRequired: true,
      };
    }
    return {
      reason: AGENT_REASON.API_ERROR,
      message:
        'Failed to connect to the Schedules API. Check your connection and try again.',
      retryable: true,
    };
  }

  const serverMessage = error.serverMessage?.trim().toLowerCase();

  if (context.local && context.action === 'invoke' && error.status >= 500) {
    return ambiguousInvokeError(true);
  }

  if (
    context.local &&
    (error.status === 401 ||
      error.status === 402 ||
      error.status === 403 ||
      /(?:project|session)_(?:mismatch|not_found|expired)/.test(
        error.code ?? ''
      ) ||
      /^(?:local )?(?:project|session)\b/.test(serverMessage ?? ''))
  ) {
    return {
      reason: AGENT_REASON.API_ERROR,
      message: `${apiErrorDetail(error) ?? 'The local Schedules session is unavailable.'} Restart ${getCommandName('dev')} in this project and use its local session.`,
      retryable: false,
      userActionRequired: true,
    };
  }

  if (error.code === 'schedule_already_exists') {
    return {
      reason: AGENT_REASON.SCHEDULE_ALREADY_EXISTS,
      message: context.name
        ? `Schedule ${context.namespace}/${context.name} already exists. Choose a different name or update the existing schedule.`
        : 'The schedule already exists. Choose a different name or update the existing schedule.',
      retryable: false,
    };
  }

  if (error.code === 'schedule_single_at_passed') {
    return {
      reason: AGENT_REASON.SCHEDULE_SINGLE_AT_PASSED,
      message: context.name
        ? `Schedule ${context.namespace}/${context.name} has passed its scheduled time and can't be modified. Delete it or create a new schedule.`
        : "The schedule has passed its scheduled time and can't be modified. Delete it or create a new schedule.",
      retryable: false,
    };
  }

  if (error.code === 'schedule_already_active') {
    const schedule = context.name
      ? [
          quoteArg(context.name),
          `--namespace ${quoteArg(context.namespace)}`,
          ...(context.trackArgs ?? []),
        ].join(' ')
      : undefined;
    return {
      reason: AGENT_REASON.SCHEDULE_ALREADY_ACTIVE,
      message: context.name
        ? `Schedule ${context.namespace}/${context.name} is already enabled without an end time. Disable it first, then enable it with --until or --for.`
        : 'The schedule is already enabled without an end time. Disable it first, then enable it with --until or --for.',
      retryable: false,
      ...(schedule && {
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `schedules disable ${schedule}`,
              undefined,
              { excludeFlags: ['--yes', '--until', '--for'] }
            ),
            when: 'Disable the schedule before enabling it with an end time',
          },
        ],
      }),
    };
  }

  if (error.code === 'static_schedule') {
    const schedule = context.name
      ? [
          quoteArg(context.name),
          `--namespace ${quoteArg(context.namespace)}`,
          ...(context.trackArgs ?? []),
        ].join(' ')
      : undefined;
    return {
      reason: AGENT_REASON.STATIC_SCHEDULE,
      message: context.name
        ? `Static schedule ${context.namespace}/${context.name} can't be updated or deleted. Enable or disable it instead.`
        : "Static schedules can't be updated or deleted. Enable or disable them instead.",
      retryable: false,
      ...(schedule && {
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `schedules enable ${schedule}`,
              undefined,
              { excludeFlags: ['--yes'] }
            ),
            when: 'Enable the static schedule',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `schedules disable ${schedule}`,
              undefined,
              { excludeFlags: ['--yes'] }
            ),
            when: 'Disable the static schedule',
          },
        ],
      }),
    };
  }

  if (error.code === 'invalid_cron_expression') {
    return {
      reason: AGENT_REASON.INVALID_CRON_EXPRESSION,
      message: `${apiErrorDetail(error) ?? 'The cron expression is invalid.'} Check \`--cron\` and try again.`,
      retryable: false,
    };
  }

  if (error.code === 'invalid_jitter') {
    return {
      reason: AGENT_REASON.INVALID_JITTER,
      message:
        apiErrorDetail(error) ?? 'The schedule jitter setting is invalid.',
      retryable: false,
    };
  }

  if (error.code === 'jitter_exceeds_cadence') {
    return {
      reason: AGENT_REASON.JITTER_EXCEEDS_CADENCE,
      message: `${apiErrorDetail(error) ?? 'The schedule jitter exceeds the interval between runs.'} Increase the interval between runs.`,
      retryable: false,
    };
  }

  if (error.code === 'single_at_too_soon') {
    return {
      reason: AGENT_REASON.SINGLE_AT_TOO_SOON,
      message: `${apiErrorDetail(error) ?? 'The one-time schedule is too soon.'} Choose a later value for \`--at\`.`,
      retryable: false,
    };
  }

  if (error.code === 'payload_too_large') {
    return {
      reason: AGENT_REASON.SCHEDULE_PAYLOAD_TOO_LARGE,
      message: `${apiErrorDetail(error) ?? 'The schedule payload is too large.'} Reduce the value passed to \`--payload\` and try again.`,
      retryable: false,
    };
  }

  if (error.code === 'payload_store_failed') {
    return {
      reason: AGENT_REASON.SCHEDULE_PAYLOAD_STORE_FAILED,
      message: 'Failed to store the schedule payload. Try again later.',
      retryable: true,
    };
  }

  if (error.code === 'service_unavailable') {
    return {
      reason: AGENT_REASON.SCHEDULE_SERVICE_UNAVAILABLE,
      message:
        'Schedule execution history is temporarily unavailable. Try again later.',
      retryable: true,
    };
  }

  if (error.code === 'service_error') {
    return {
      reason: AGENT_REASON.SCHEDULE_SERVICE_ERROR,
      message:
        error.status >= 500
          ? 'Failed to load schedule execution history. Try again later.'
          : 'Failed to load schedule execution history. Choose a shorter time range and try again.',
      retryable: error.status >= 500,
    };
  }

  if (error.status === 400) {
    const detail = apiErrorDetail(error);
    return {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `The Schedules API rejected the request.${detail ? ` ${detail}` : ''}`,
      retryable: false,
    };
  }

  if (error.status === 401 && error.code === 'missing_team_param') {
    return {
      reason: AGENT_REASON.MISSING_SCOPE,
      message:
        'Schedules requires a team project. Run `vercel link` to link a project owned by a team.',
      retryable: false,
      userActionRequired: true,
    };
  }

  if (error.status === 401) {
    const tokenSource = client.authConfig.tokenSource;
    return {
      reason: AGENT_REASON.LOGIN_REQUIRED,
      message:
        tokenSource === 'env'
          ? 'Schedules API authentication failed. Replace VERCEL_TOKEN, or unset it to use your saved login.'
          : tokenSource === 'flag'
            ? 'Schedules API authentication failed. Replace the token passed to `--token`.'
            : `Schedules API authentication failed. Run ${getCommandName('login')} and try again.`,
      retryable: false,
      userActionRequired: true,
    };
  }

  if (error.status === 402) {
    const detail = apiErrorDetail(error);
    return {
      reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
      message: `Schedules isn't available for this team.${detail ? ` ${detail}` : ''} Ask a team owner to review the requirement.`,
      retryable: false,
      userActionRequired: true,
    };
  }

  if (
    (error.status === 403 && error.code === 'not_enabled') ||
    (!context.local &&
      error.status === 404 &&
      (serverMessage === 'not found' || serverMessage === 'not found.'))
  ) {
    return {
      reason: AGENT_REASON.SCHEDULES_NOT_ENABLED,
      message: 'Vercel Schedules is not enabled for this team.',
      retryable: false,
      userActionRequired: true,
    };
  }

  if (error.status === 403) {
    return {
      reason: AGENT_REASON.PERMISSION_DENIED,
      message:
        "Can't access Schedules with the current credentials and team. Check the token and selected team. If both are correct, ask a team owner for access.",
      retryable: false,
      userActionRequired: true,
    };
  }

  if (
    error.status === 404 &&
    (serverMessage === 'project not found' ||
      serverMessage === 'project not found.')
  ) {
    return {
      reason: AGENT_REASON.PROJECT_NOT_FOUND,
      message:
        "The linked project isn't available to this team. Run `vercel link` to update the project link.",
      retryable: false,
      userActionRequired: true,
    };
  }

  if (
    error.status === 404 &&
    context.action !== 'create' &&
    context.action !== 'list' &&
    context.name
  ) {
    return {
      reason: AGENT_REASON.NOT_FOUND,
      message: `Schedule not found: ${context.namespace}/${context.name}.`,
      retryable: false,
    };
  }

  if (error.status === 429) {
    const retryAfterMs =
      typeof error.retryAfterMs === 'number' && error.retryAfterMs > 0
        ? error.retryAfterMs
        : undefined;
    return {
      reason: AGENT_REASON.RATE_LIMITED,
      message:
        retryAfterMs === undefined
          ? 'The Schedules API request limit was reached. Wait and try again.'
          : `The Schedules API request limit was reached. Try again in ${Math.ceil(retryAfterMs / 1000)} second${retryAfterMs > 1000 ? 's' : ''}.`,
      retryable: true,
      ...(retryAfterMs && { retryAfterMs }),
    };
  }

  if (error.status >= 500) {
    if (context.action === 'invoke') {
      return ambiguousInvokeError(context.local);
    }
    return {
      reason: AGENT_REASON.API_ERROR,
      message: context.local
        ? `Local Schedules is unavailable. Check the ${getCommandName('dev')} output and restart the local session if needed.`
        : 'The Schedules API is temporarily unavailable. Try again later.',
      retryable: true,
    };
  }

  const detail = apiErrorDetail(error);
  return {
    reason: AGENT_REASON.API_ERROR,
    message: `Failed to ${requestDescription(context)}.${detail ? ` ${detail}` : ''}`,
    retryable: false,
  };
}

export function handleSchedulesApiError(
  client: Client,
  error: unknown,
  context: ScheduleErrorContext
): number {
  const details = getSchedulesError(client, error, context);

  if (client.nonInteractive) {
    // An API failure exits 1 whatever its reason, as in human mode.
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        ...details,
      },
      1
    );
    return 1;
  }

  output.fatal(details.message);
  return 1;
}
