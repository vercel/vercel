import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import {
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
  type AgentErrorPayload,
} from '../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import output from '../../output-manager';

type CiFailure = {
  reason: string;
  message: string;
  next?: AgentErrorPayload['next'];
};

/**
 * Reports a failure as a JSON payload in non-interactive mode and as a fatal
 * error on stderr otherwise. Returns the exit code for the caller to return.
 */
export function failCi(client: Client, failure: CiFailure): number {
  if (shouldEmitNonInteractiveCommandError(client)) {
    writeAgentError(client, { status: AGENT_STATUS.ERROR, ...failure });
  } else {
    output.fatal(failure.message);
  }
  return getExitCodeForReason(failure.reason);
}

export function invalidCiArguments(client: Client, message: string): number {
  return failCi(client, {
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    message,
  });
}

export function handleCiApiError(
  client: Client,
  action: string,
  err: unknown
): number {
  if (isAPIError(err)) {
    const detail = err.serverMessage ? ` ${err.serverMessage}` : '';
    switch (err.status) {
      case 403:
        return failCi(client, {
          reason: AGENT_REASON.PERMISSION_DENIED,
          message: `Can't ${action}. You don't have access to Vercel CI runs for this team.`,
        });
      case 404:
        return failCi(client, {
          reason: AGENT_REASON.CI_RUN_NOT_FOUND,
          message: `Couldn't find that Vercel CI run for this team.`,
        });
      case 429:
        return failCi(client, {
          reason: AGENT_REASON.RATE_LIMITED,
          message: `Failed to ${action}. Too many requests. Wait a moment, then try again.`,
        });
      default:
        return failCi(client, {
          reason: AGENT_REASON.API_ERROR,
          message: `Failed to ${action}.${detail}`,
        });
    }
  }
  throw err;
}
