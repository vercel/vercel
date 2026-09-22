import type Client from '../../../util/client';
import output from '../../../output-manager';
import { printError } from '../../../util/error';
import { isAPIError } from '../../../util/errors-ts';
import {
  type AgentErrorPayload,
  outputAgentError,
} from '../../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
} from '../../../util/agent-output-constants';

function messageFor(err: unknown): string {
  if (isAPIError(err)) {
    return err.serverMessage || err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Prints an error from the project tracing endpoints and returns the exit code.
 *
 * A 403 surfaces the API's own message verbatim: only the platform knows which
 * plan or role gates observability settings, and CLI copy that names them goes
 * stale as soon as packaging changes.
 *
 * A non-interactive run also answers on stdout, where its success payload goes,
 * and the status picks the reason: without it an agent reads an empty stdout and
 * one prose line on stderr, and cannot tell "no permission" from "no project".
 */
export function handleTracingApiError(client: Client, err: unknown): number {
  if (client.nonInteractive) {
    const status = isAPIError(err) ? err.status : undefined;
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason:
        status === 403
          ? AGENT_REASON.PERMISSION_DENIED
          : status === 404
            ? AGENT_REASON.NOT_FOUND
            : AGENT_REASON.API_ERROR,
      message: messageFor(err),
    });
  }

  if (isAPIError(err) && err.status === 403) {
    output.error(messageFor(err));
    return 1;
  }
  printError(err);
  return 1;
}

/**
 * Reports a failure the CLI decided on its own, without an API error to quote.
 * Non-interactive callers get the machine-readable reason as well, matching how
 * `traces get` reports its own flag validation.
 */
function configError(client: Client, reason: string, message: string): number {
  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason,
      message,
    });
  }
  output.error(message);
  return 1;
}

/** An argument the CLI rejected before it reached the API. */
export function invalidArguments(client: Client, message: string): number {
  return configError(client, AGENT_REASON.INVALID_ARGUMENTS, message);
}

/** A rule the command was asked to act on that the project does not have. */
export function ruleNotFound(client: Client, message: string): number {
  return configError(client, AGENT_REASON.NOT_FOUND, message);
}

/**
 * Reports a confirmation this session cannot collect.
 *
 * `userActionRequired` is the field that ends the exchange rather than
 * restarting it: no flag grants this consent, so an agent that reads the
 * payload has to hand the command to a person instead of retrying. `next`
 * therefore carries the command to run by hand, not a variation that would
 * succeed unattended.
 */
export function confirmationRequired(
  client: Client,
  message: string,
  next?: AgentErrorPayload['next']
): number {
  outputAgentError(client, {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.CONFIRMATION_REQUIRED,
    message,
    userActionRequired: true,
    next,
  });
  output.error(message);
  return 1;
}
