import type Client from './client';
import {
  currentTeamPlan,
  observabilityPlusDenialReason,
  observabilityPlanRecovery,
} from './metrics/plan-gate';
import { teamCache } from './teams/get-team-by-id-or-slug';

export interface ErrorRecovery {
  hint?: string;
  /** Whether repeating the same request can succeed without changing its prerequisites. */
  retryable?: boolean;
  retryAfterMs?: number;
  userActionRequired?: boolean;
  scope?: string;
  action?: string;
  resource?: string;
}

export function errorContext(client?: Client): string | undefined {
  // Use the resolved identity, not a flag-like string inside a command value.
  const teamId = client?.config?.currentTeam;
  if (teamId) {
    // Error reporting must not make another request that could also fail.
    // An unresolved team must not be mislabeled as the personal account.
    return (
      client?.teams?.find(team => team.id === teamId || team.slug === teamId)
        ?.slug ?? teamCache.get(teamId)?.slug
    );
  }
  return client?.user?.username || client?.user?.email;
}

/** Recovery is selected by the failure, never by an unrelated command-family default. */
export function getErrorRecovery(
  error: {
    status?: number | string;
    reason?: string;
    message?: string;
    serverMessage?: string;
    retryAfterMs?: number | 'never';
    action?: string;
    resource?: string;
  },
  client?: Client
): ErrorRecovery {
  const reason = error.reason?.toLowerCase();
  const scope = errorContext(client);
  if (
    error.status === 403 ||
    ['forbidden', 'permission_denied', 'scope_not_accessible'].includes(
      reason ?? ''
    )
  ) {
    return {
      hint: `Check that the selected team is correct${scope ? ` (${scope})` : ''}. If it is, ask a team owner to grant the required access. Retry only after the team or access changes.`,
      retryable: false,
      userActionRequired: true,
      ...(scope && { scope }),
      ...(error.action && { action: error.action }),
      ...(error.resource && { resource: error.resource }),
    };
  }
  if (error.status === 401 || reason === 'not_authorized') {
    return {
      hint: 'Provide valid credentials for the intended account and team, then retry.',
      retryable: false,
      userActionRequired: true,
    };
  }
  if (
    error.status === 402 ||
    ['payment_required', 'plan_upgrade_required'].includes(reason ?? '')
  ) {
    const message = error.serverMessage ?? error.message ?? '';
    return {
      hint:
        observabilityPlanRecovery(
          message,
          observabilityPlusDenialReason(error),
          currentTeamPlan(client)
        )?.hint ??
        (/(?:disabled|switched off|re-enable)/i.test(message)
          ? 'Enable the feature for the selected team or project, then retry.'
          : /(?:overdue|payment method|unpaid|balance)/i.test(message)
            ? 'Ask a team owner to resolve the billing issue, then retry.'
            : /(?:plan|subscription)/i.test(message)
              ? 'Ask a team owner to confirm the required plan or subscription before changing billing. Retry after access is enabled.'
              : 'Check the billing or feature requirement reported above with a team owner. Retry after that requirement is resolved.'),
      retryable: false,
      userActionRequired: true,
      ...(scope && { scope }),
    };
  }
  if (error.status === 429 || reason === 'rate_limited') {
    const wait = error.retryAfterMs;
    return {
      hint:
        typeof wait === 'number' && Number.isFinite(wait) && wait > 0
          ? `Wait at least ${Math.ceil(wait / 1000)} seconds before trying again.`
          : wait === 'never'
            ? 'This request cannot be retried with the current limit. Ask a team owner to review the limit.'
            : 'The request limit was reached. Wait before trying again; no retry time was provided.',
      retryable: wait !== 'never',
      ...(typeof wait === 'number' &&
        Number.isFinite(wait) &&
        wait > 0 && { retryAfterMs: wait }),
    };
  }
  return {};
}
