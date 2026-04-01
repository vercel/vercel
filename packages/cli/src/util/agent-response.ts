import type Client from './client';
import { enrichActionRequiredWithInvokingCommand } from './agent-output';

/**
 * Unified agent response payload.
 *
 * Unlike `outputActionRequired`/`outputAgentError`, the `writeAgentResponse`
 * function does NOT call `process.exit()` — the caller returns the exit code
 * normally. This makes commands easier to test and reason about.
 */
export interface AgentResponse {
  status: 'ok' | 'error' | 'action_required' | 'dry_run';
  reason?: string;
  message: string;
  data?: Record<string, unknown>;
  next?: Array<{ command: string; when?: string }>;
  choices?: Array<{ id: string; name: string }>;
  hint?: string;
  userActionRequired?: boolean;
  verification_uri?: string;
  missing?: string[];
}

/**
 * Write structured JSON to stdout when `client.nonInteractive`.
 *
 * Returns `true` if the response was written (agent mode), `false` otherwise.
 * Does NOT call `process.exit()`.
 */
export function writeAgentResponse(
  client: Client,
  response: AgentResponse
): boolean {
  if (!client.nonInteractive) {
    return false;
  }

  let payload: AgentResponse = { ...response };

  // For action_required with choices, enrich next[] with link + invoking commands
  if (payload.status === 'action_required' && payload.choices?.length) {
    payload = enrichActionRequiredWithInvokingCommand(
      {
        status: 'action_required',
        reason: payload.reason,
        message: payload.message,
        choices: payload.choices,
        next: payload.next,
        hint: payload.hint,
        userActionRequired: payload.userActionRequired,
        verification_uri: payload.verification_uri,
        missing: payload.missing,
      },
      client.argv
    ) as AgentResponse;
    // Preserve data field from original response (enrichment doesn't handle it)
    if (response.data) {
      payload.data = response.data;
    }
  }

  // Add default hint for action_required/error with next[] suggestions
  if (
    !payload.hint &&
    payload.next?.length &&
    (payload.status === 'action_required' || payload.status === 'error')
  ) {
    payload.hint =
      'Run one of the commands in next[] to complete without prompting.';
  }

  client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return true;
}

/**
 * Auto-detect: if `client.nonInteractive`, write JSON and return the exit code.
 * Otherwise return `null` (caller should do human output).
 *
 * Does NOT call `process.exit()`.
 *
 * Usage:
 * ```ts
 * const exitCode = maybeAgentResponse(client, {
 *   status: 'error',
 *   reason: 'not_linked',
 *   message: 'Project is not linked',
 *   next: [{ command: 'vercel link' }],
 * }, EXIT_CODE.CONFIG_ERROR);
 * if (exitCode !== null) return exitCode;
 * // ...human output below
 * ```
 */
export function maybeAgentResponse(
  client: Client,
  response: AgentResponse,
  exitCode: number
): number | null {
  if (writeAgentResponse(client, response)) {
    return exitCode;
  }
  return null;
}
