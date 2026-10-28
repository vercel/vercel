import { randomUUID } from 'node:crypto';
import type Client from '../client';
import pkg from '../pkg';

export function agentErrorMetadata(client: Client): {
  cliVersion?: string;
  invocationId?: string;
} {
  return client.isAgent
    ? {
        cliVersion: pkg.version,
        invocationId: client.telemetryEventStore?.currentInvocationId,
      }
    : {};
}

/** Fixed categories only: no messages, commands, resource names, or credentials. */
export function agentErrorCategory(reason: string): string {
  if (/^(forbidden|permission_denied|scope_not_accessible)$/i.test(reason))
    return 'permission';
  if (/^(payment_required|plan_upgrade_required)$/i.test(reason))
    return 'billing';
  if (/^(not_authorized|login_required)$/i.test(reason))
    return 'authentication';
  if (/^(rate_limited|too_many_requests)$/i.test(reason)) return 'rate_limit';
  if (/^(invalid_arguments|unknown_command|ARG_UNKNOWN_OPTION)$/i.test(reason))
    return 'usage';
  if (/^(link_required|project_not_found|not_found)$/i.test(reason))
    return 'project_context';
  return 'other';
}

export function trackAgentError(
  client: Client,
  error: {
    reason: string;
    hint?: string;
    retryable?: boolean;
    userActionRequired?: boolean;
  }
): void {
  if (!client.isAgent || !client.telemetryEventStore) return;
  client.telemetryEventStore.add({
    id: randomUUID(),
    eventTime: Date.now(),
    key: 'agent_error',
    value: JSON.stringify({
      invocationId: client.telemetryEventStore.currentInvocationId,
      category: agentErrorCategory(error.reason),
      hasRecovery: Boolean(error.hint),
      retryable: error.retryable,
      userActionRequired: error.userActionRequired,
    }),
  });
}

/** True when `--help` or `-h` comes before any `--` separator. */
export function isHelpInvocation(argv: string[]): boolean {
  const args = argv.slice(2);
  const separator = args.indexOf('--');
  return args
    .slice(0, separator < 0 ? args.length : separator)
    .some(arg => arg === '--help' || arg === '-h');
}

export function trackAgentCommandOutcome(
  client: Client,
  exitCode: number
): void {
  if (!client.isAgent || !client.telemetryEventStore) return;
  const help = isHelpInvocation(client.argv);
  client.telemetryEventStore.add({
    id: randomUUID(),
    eventTime: Date.now(),
    key: 'agent_command_outcome',
    value: JSON.stringify({
      invocationId: client.telemetryEventStore.currentInvocationId,
      exitCode,
      outcome:
        help && (exitCode === 0 || exitCode === 2)
          ? 'help'
          : exitCode === 0
            ? 'success'
            : 'failure',
    }),
  });
}
