/**
 * Global constants for non-interactive agent payloads (status, reason, action).
 * Use these in outputAgentError and outputActionRequired so values stay consistent
 * across commands (redirects, routes, dns, env, etc.) and can be documented as a single source of truth.
 */

export const AGENT_STATUS = {
  ERROR: 'error',
  ACTION_REQUIRED: 'action_required',
  OK: 'ok',
} as const;

export const AGENT_REASON = {
  MISSING_ARGUMENTS: 'missing_arguments',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  NOT_LINKED: 'not_linked',
  NOT_FOUND: 'not_found',
  INVALID_ARGUMENTS: 'invalid_arguments',
  /** Redirect with given source not found (redirects remove) */
  REDIRECT_NOT_FOUND: 'redirect_not_found',
  /** Version ID/name not found (redirects promote, restore) */
  VERSION_NOT_FOUND: 'version_not_found',
  /** Version is already live (redirects promote, restore) */
  VERSION_ALREADY_LIVE: 'version_already_live',
  /** Version is staging; restore expects non-staging (redirects restore) */
  VERSION_IS_STAGING: 'version_is_staging',
  /** Multiple routes match identifier; agent must pass exact name or ID (routes) */
  AMBIGUOUS_ROUTE: 'ambiguous_route',
} as const;

export const AGENT_ACTION = {
  MISSING_ARGUMENTS: 'missing_arguments',
  CONFIRMATION_REQUIRED: 'confirmation_required',
} as const;
