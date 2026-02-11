import type Client from './client';
import { packageName } from './pkg-name';

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
 * Builds the invoking CLI command with --yes added (or retained).
 * Used for non-interactive "confirmation required" payloads.
 */
export function buildCommandWithYes(
  argv: string[],
  pkgName: string = packageName
): string {
  const args = argv.slice(2);
  const hasYes = args.some(a => a === '--yes' || a === '-y');
  const out = hasYes ? [...args] : [...args, '--yes'];
  return `${pkgName} ${out.join(' ')}`;
}

/**
 * Builds the invoking CLI command with --scope set to the given slug
 * (strips existing --scope/--team from argv so the result is canonical).
 */
export function buildCommandWithScope(
  argv: string[],
  scopeSlug: string,
  pkgName: string = packageName
): string {
  const args = argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    // Handle space-separated: --scope VALUE, --team VALUE, -S VALUE, -T VALUE
    if (
      args[i] === '--scope' ||
      args[i] === '--team' ||
      args[i] === '-S' ||
      args[i] === '-T'
    ) {
      i++; // skip the next arg (the value)
      continue;
    }
    // Handle equals-separated: --scope=VALUE, --team=VALUE
    if (args[i].startsWith('--scope=') || args[i].startsWith('--team=')) {
      continue;
    }
    out.push(args[i]);
  }
  out.push('--scope', scopeSlug);
  return `${pkgName} ${out.join(' ')}`;
}

/**
 * Enriches an action_required payload so next[] includes both:
 * - Link command per choice (so the agent can link once for future commands).
 * - Invoking command with --scope per choice (so the agent can retry the same command without linking).
 * Pass argv from the current process (e.g. client.argv) to build the invoking command.
 */
export function enrichActionRequiredWithInvokingCommand(
  payload: ActionRequiredPayload,
  argv: string[]
): ActionRequiredPayload {
  if (!payload.choices?.length) {
    return payload;
  }
  const next: Array<{ command: string; when?: string }> = [];
  for (const choice of payload.choices) {
    const slug = choice.name;
    next.push({
      command: `${packageName} link --scope ${slug}`,
      when: 'Link first (then run any command without --scope)',
    });
    next.push({
      command: buildCommandWithScope(argv, slug),
      when: 'Run this command with scope (no link)',
    });
  }
  return { ...payload, next };
}

/**
 * When client.nonInteractive, writes the action_required payload as a single
 * JSON line to stdout and exits with exitCode (default 1).
 * The payload's next[] is enriched with both link commands and the invoking command with --scope.
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
  const enriched = enrichActionRequiredWithInvokingCommand(
    payload,
    client.argv
  );
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(enriched, null, 2));
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
  console.log(JSON.stringify(payload, null, 2));
  process.exit(exitCode);
}
