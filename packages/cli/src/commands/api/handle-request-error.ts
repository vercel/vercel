import type Client from '../../util/client';
import { isAPIError, type APIError } from '../../util/errors-ts';
import output from '../../output-manager';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';

/**
 * The API attaches `requiredScopes` to scope-caused 403 responses
 * (`{"error": {"code": "forbidden", "action", "resource", "requiredScopes"}}`)
 * listing the OAuth scopes that would grant the denied permission.
 * `responseError()` copies those body fields onto the thrown `APIError`.
 */
function getRequiredScopes(err: APIError): string[] | undefined {
  const value = err.requiredScopes;
  if (!Array.isArray(value)) {
    return undefined;
  }
  const scopes = value.filter((s): s is string => typeof s === 'string');
  return scopes.length > 0 ? scopes : undefined;
}

/**
 * Surfaces request failures from `vercel api`. For 403 responses, the
 * permission details from the error body (missing scopes, denied
 * action/resource, inaccessible team scope) are surfaced to the caller:
 * in non-interactive/agent mode as a structured JSON payload on stdout
 * (exits the process), and in interactive mode as extra context under the
 * error message.
 */
export function handleRequestError(client: Client, err: unknown): number {
  if (!isAPIError(err) || err.status !== 403) {
    output.prettyError(err);
    return 1;
  }

  const requiredScopes = getRequiredScopes(err);
  const action = typeof err.action === 'string' ? err.action : undefined;
  const resource = typeof err.resource === 'string' ? err.resource : undefined;
  // Team scope (slug) from "Not authorized: Trying to access resource under
  // scope ..." responses.
  const teamScope = typeof err.scope === 'string' ? err.scope : undefined;
  const message = err.serverMessage || err.message;

  let reason: string = AGENT_REASON.PERMISSION_DENIED;
  let hint: string;
  if (requiredScopes) {
    reason = AGENT_REASON.MISSING_SCOPE;
    hint =
      `The token does not include a scope that grants this permission. ` +
      `Use a token authorized with one of the following scopes: ${requiredScopes.join(', ')}.`;
  } else if (teamScope) {
    reason = AGENT_REASON.SCOPE_NOT_ACCESSIBLE;
    hint = `The token does not have access to the "${teamScope}" scope. Use a token issued for that scope, or re-authenticate.`;
  } else if (action && resource) {
    hint = `The token is not allowed to ${action} the ${resource}. Use a token with access to that resource.`;
  } else {
    hint = 'The token is not authorized for this request.';
  }

  // Non-interactive/agent mode: single JSON payload on stdout, then exit.
  outputAgentError(client, {
    status: 'error',
    reason,
    message,
    ...(requiredScopes && { requiredScopes }),
    ...(action && { action }),
    ...(resource && { resource }),
    ...(teamScope && { scope: teamScope }),
    hint,
    userActionRequired: true,
    next: [
      {
        command: `${packageName} login`,
        when: 'Re-authenticate to grant the missing access (interactive)',
      },
    ],
  });

  // Interactive mode: keep the standard error line and add the permission
  // context underneath it.
  output.prettyError(err);
  output.log(hint);
  return 1;
}
