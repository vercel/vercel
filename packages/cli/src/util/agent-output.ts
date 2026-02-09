import type Client from './client';

/**
 * Structured payload for "action required" (e.g. scope choice, login passcode).
 * When client.nonInteractive, commands output this as JSON and exit so agents
 * can parse and suggest the next command.
 */
export interface ActionRequiredPayload {
  status: 'action_required';
  reason?: string;
  action?: string;
  message: string;
  verification_uri?: string;
  choices?: Array<{ id: string; name: string }>;
  next?: Array<{ command: string; when?: string }>;
}

/**
 * Type guard for ActionRequiredPayload (e.g. from ensureLink or selectOrg).
 */
export function isActionRequiredPayload(
  value: unknown
): value is ActionRequiredPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    (value as ActionRequiredPayload).status === 'action_required'
  );
}

/**
 * Structured payload for errors in non-interactive mode.
 */
export interface AgentErrorPayload {
  status: 'error';
  reason: string;
  message: string;
  next?: Array<{ command: string }>;
}

/**
 * When client.nonInteractive, writes the action_required payload as a single
 * JSON line to stdout and exits with exitCode (default 1).
 * In interactive mode, does nothing (caller should show prompts or errors as usual).
 */
export function outputActionRequired(
  client: Client,
  payload: ActionRequiredPayload,
  exitCode: number = 1
): void {
  if (!client.nonInteractive) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
  process.exit(exitCode);
}

/**
 * When client.nonInteractive, writes the error payload as a single JSON line
 * to stdout and exits with exitCode (default 1).
 * In interactive mode, does nothing (caller should print error as usual).
 */
export function outputAgentError(
  client: Client,
  payload: AgentErrorPayload,
  exitCode: number = 1
): void {
  if (!client.nonInteractive) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
  process.exit(exitCode);
}
