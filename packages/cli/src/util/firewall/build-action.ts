import type { FirewallRuleAction } from './types';
import { VALID_DURATIONS, VALID_ALGORITHMS } from './condition-types';

/**
 * Build a FirewallRuleAction from CLI flags.
 * Returns the action object on success, or an error string on validation failure.
 * Shared between `rules add` and `rules edit` flag mode.
 */
export function buildActionFromFlags(
  flags: Record<string, unknown>,
  actionType: string
): FirewallRuleAction | string {
  const duration = flags['--duration'] as string | undefined;

  if (
    duration &&
    !VALID_DURATIONS.includes(duration as (typeof VALID_DURATIONS)[number])
  ) {
    return `Invalid duration "${duration}". Valid durations: ${VALID_DURATIONS.join(', ')}`;
  }

  const action: FirewallRuleAction = {
    mitigate: {
      action: actionType,
      rateLimit: null,
      redirect: null,
      actionDuration: duration || null,
    },
  };

  if (actionType === 'rate_limit') {
    const algo = (flags['--rate-limit-algo'] as string) || 'fixed_window';
    const window = flags['--rate-limit-window'] as number | undefined;
    const requests = flags['--rate-limit-requests'] as number | undefined;
    const keys = (flags['--rate-limit-keys'] as string[]) || ['ip'];

    if (!VALID_ALGORITHMS.includes(algo as (typeof VALID_ALGORITHMS)[number])) {
      return `Invalid rate limit algorithm "${algo}". Valid: ${VALID_ALGORITHMS.join(', ')}`;
    }
    if (!window || window < 10) {
      return 'Rate limit --rate-limit-window is required (minimum 10 seconds).';
    }
    if (window > 3600) {
      return 'Rate limit --rate-limit-window maximum is 3600 seconds (1 hour).';
    }
    if (!requests || requests < 1) {
      return 'Rate limit --rate-limit-requests is required (minimum 1).';
    }
    if (requests > 10_000_000) {
      return 'Rate limit --rate-limit-requests maximum is 10,000,000.';
    }

    const rlAction = (flags['--rate-limit-action'] as string) || 'rate_limit';
    const validRlActions = ['log', 'deny', 'challenge', 'rate_limit'];
    if (!validRlActions.includes(rlAction)) {
      return `Invalid rate limit action "${rlAction}". Valid: ${validRlActions.join(', ')}`;
    }

    action.mitigate!.rateLimit = {
      algo: algo as 'fixed_window' | 'token_bucket',
      window,
      limit: requests,
      keys,
      action: rlAction,
    };
  }

  if (actionType === 'redirect') {
    const redirectUrl = flags['--redirect-url'] as string | undefined;
    const permanent = !!flags['--redirect-permanent'];

    if (!redirectUrl) {
      return 'Redirect action requires --redirect-url.';
    }
    if (
      !redirectUrl.startsWith('/') &&
      !redirectUrl.startsWith('http://') &&
      !redirectUrl.startsWith('https://')
    ) {
      return 'Redirect URL must start with /, http://, or https://';
    }

    action.mitigate!.redirect = {
      location: redirectUrl,
      permanent,
    };
  }

  return action;
}
