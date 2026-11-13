import { AGENT_REASON } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import { packageName } from '../../util/pkg-name';

/** Vercel CLI's reason for a 402, as `printError` reports it. */
const PAYMENT_REQUIRED = 'payment_required';

/** A failure with a Vercel CLI agent-output `reason`, a message for people, and next steps for agents. */
export class AgentError extends Error {
  override name = 'AgentError';

  constructor(
    readonly reason: string,
    message: string,
    readonly next: Array<{ command: string; when?: string }> = []
  ) {
    super(message);
  }
}

export function usageError(message: string): AgentError {
  return new AgentError(AGENT_REASON.INVALID_ARGUMENTS, message);
}

/**
 * Turn whatever a command step threw into an `AgentError` with an actionable message.
 *
 * `client.fetch` throws Vercel CLI's API errors, which only carry a message when the body is
 * `{ error: { message } }`. The Vercel Agent proxy answers `{ error: '…', reason, enableBillingUrl }`,
 * so its errors are told apart by status alone.
 */
export function toAgentError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (isAPIError(error)) {
    const login = [
      {
        command: `${packageName} login`,
      },
    ];
    if (
      error.status === 401 ||
      (error.status === 403 && error.invalidToken === true)
    )
      return new AgentError(
        AGENT_REASON.LOGIN_REQUIRED,
        'Your Vercel token was rejected. Run `vercel login`, or check VERCEL_TOKEN.',
        login
      );
    if (error.status === 402)
      return new AgentError(
        PAYMENT_REQUIRED,
        'Vercel Agent is not available on this team. It needs a Pro or Enterprise plan with Agent enabled.'
      );
    if (error.status === 403)
      return new AgentError(
        AGENT_REASON.SCOPE_NOT_ACCESSIBLE,
        'You do not have access to Vercel Agent on this team. A team admin may have turned it off.'
      );
    if (error.status === 404)
      return new AgentError(AGENT_REASON.NOT_FOUND, error.message);
    return new AgentError(
      AGENT_REASON.API_ERROR,
      `Request failed: ${error.message}`
    );
  }
  if (error instanceof TypeError && /fetch failed/i.test(error.message))
    return new AgentError(
      AGENT_REASON.NETWORK_ERROR,
      'Could not reach Vercel. Check your connection and try again.'
    );
  return new AgentError(
    AGENT_REASON.API_ERROR,
    error instanceof Error ? error.message : String(error)
  );
}
