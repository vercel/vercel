import type Client from '../../../util/client';
import { outputError } from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';

type VcrApiError = { status: number; code?: string; serverMessage?: string };

interface StatusInfo {
  reason: string;
  message: (err: VcrApiError) => string;
  hint?: string;
  suggestWhoami?: boolean;
}

const NOT_AUTHORIZED_MESSAGE =
  'You do not have access to the container registry in this scope. Ensure your role can manage the project, or pass --token and --scope.';
const NOT_AUTHORIZED_HINT =
  'Confirm team scope with whoami; use --scope <team-slug> if the repository lives under another team.';
const genericMessage = (err: VcrApiError): string =>
  err.serverMessage || `API error (${err.status}).`;

const STATUS_INFO: Record<number, StatusInfo> = {
  401: {
    reason: 'not_authorized',
    message: () => NOT_AUTHORIZED_MESSAGE,
    hint: NOT_AUTHORIZED_HINT,
    suggestWhoami: true,
  },
  403: {
    reason: 'forbidden',
    message: () => NOT_AUTHORIZED_MESSAGE,
    hint: NOT_AUTHORIZED_HINT,
    suggestWhoami: true,
  },
  404: { reason: AGENT_REASON.NOT_FOUND, message: genericMessage },
  409: { reason: 'conflict', message: genericMessage },
  429: { reason: 'rate_limited', message: genericMessage },
};

function resolveStatusInfo(err: VcrApiError): StatusInfo {
  if (STATUS_INFO[err.status]) {
    return STATUS_INFO[err.status];
  }
  if (err.status >= 500) {
    return {
      reason: AGENT_REASON.API_ERROR,
      message: () =>
        `The container registry endpoint failed (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`,
    };
  }
  return { reason: AGENT_REASON.API_ERROR, message: genericMessage };
}

/**
 * Maps a VCR API error to a machine-readable agent payload (non-interactive)
 * and a human-readable message, returning exit code 1.
 */
export function handleVcrApiError(
  client: Client,
  err: VcrApiError,
  jsonOutput: boolean,
  opts: { retry?: { command: string; when?: string } } = {}
): number {
  const info = resolveStatusInfo(err);
  const message = info.message(err);

  const next: Array<{ command: string; when?: string }> = [];
  if (info.suggestWhoami) {
    next.push({
      command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
      when: 'See current user and team',
    });
  }
  if (opts.retry) {
    next.push(opts.retry);
  }

  outputAgentError(
    client,
    {
      status: 'error',
      reason: info.reason,
      message,
      ...(info.hint ? { hint: info.hint } : {}),
      ...(next.length > 0 ? { next } : {}),
    },
    1
  );

  return outputError(client, jsonOutput, err.code || 'API_ERROR', message);
}

export function emitVcrArgParseError(
  client: Client,
  err: unknown,
  recoverTemplate: string
): void {
  const msg = err instanceof Error ? err.message : String(err);
  const projectFlagMissingArg =
    msg.includes('--project') && msg.includes('requires argument');
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: projectFlagMissingArg
        ? '`--project` requires a project name or id (for example `--project my-app`).'
        : msg,
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, recoverTemplate),
          when: projectFlagMissingArg
            ? 'Re-run with a project name or id (replace placeholder)'
            : 'See valid usage',
        },
      ],
    },
    1
  );
}
