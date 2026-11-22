import output from '../../output-manager';
import type Client from '../client';
import { isAPIError } from '../errors-ts';
import { outputAgentError } from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';

/** Thrown when an API response does not match the shape the CLI renders. */
export class OrganizationResponseError extends Error {}

/** What the failed request tried to do, for CLI-written error copy. */
export interface FailedAction {
  /** The action and its object, such as `update organization acme`. */
  action: string;
  /** The headline for a 404, such as `Couldn't find organization acme.` */
  notFound?: string;
}

/**
 * Translates an Organizations API failure into human and agent output.
 *
 * The headline and the JSON `message` are CLI copy from the error class. The
 * API's own message is remote text, so it only appears as a detail row and as
 * JSON `data.remoteMessage`, with control characters removed.
 *
 * Returns an exit code for every failure, because the organization commands
 * have no partial-success path to recover into.
 */
export function handleOrganizationApiError(
  client: Client,
  err: unknown,
  failed: FailedAction
): number {
  if (!isAPIError(err)) {
    output.debug(`Organization request failed: ${err}`);
    const cause = err instanceof OrganizationResponseError ? err.message : '';
    return report(client, {
      reason: AGENT_REASON.API_ERROR,
      message: `Failed to ${failed.action}.${cause ? ` ${cause}` : ''}`,
    });
  }

  const remote = stripControlCharacters(err.serverMessage || '');

  if (err.status === 404) {
    return report(client, {
      reason: AGENT_REASON.NOT_FOUND,
      message: failed.notFound ?? `Couldn't ${failed.action}. It wasn't found.`,
    });
  }

  if (err.status === 403) {
    return report(client, {
      reason: AGENT_REASON.PERMISSION_DENIED,
      message: `You can't ${failed.action}.`,
      remote,
      action: err.action,
      resource: typeof err.resource === 'string' ? err.resource : undefined,
    });
  }

  const plan = typeof err.code === 'string' && PLAN_CAUSES[err.code];
  if (plan) {
    return report(client, {
      reason: AGENT_REASON.PLAN_LIMIT,
      message: `Can't ${failed.action}. ${plan}.`,
      remote,
    });
  }

  if (err.status === 409) {
    const conflict = typeof err.code === 'string' && CONFLICT_CAUSES[err.code];
    return report(client, {
      reason: AGENT_REASON.CONFLICT,
      message: `Can't ${failed.action}. ${conflict || 'It conflicts with the current state of the organization or team'}.`,
      remote,
    });
  }

  if (err.status === 429) {
    return report(client, {
      reason: AGENT_REASON.RATE_LIMITED,
      message: 'Too many requests to the Vercel API. Try again later.',
    });
  }

  return report(client, {
    reason: AGENT_REASON.API_ERROR,
    message: `Failed to ${failed.action}.`,
    remote,
  });
}

// CLI copy for the API error codes that have a known cause. The API message
// stays in the detail row, because one code can cover several causes.
const CONFLICT_CAUSES: Record<string, string> = {
  already_exists: 'Another organization uses this slug',
  slug_conflict: 'Another team uses this slug',
  team_already_in_organization: 'The team already belongs to an organization',
  team_organization_transfer_in_progress:
    'The team is already moving to an organization',
};

const PLAN_CAUSES: Record<string, string> = {
  invalid_billing_plan: "The team's billing plan doesn't allow it",
  child_team_limit_reached:
    'The organization has reached its limit of enterprise child teams',
  team_already_enterprise:
    "An existing Enterprise team can't become an enterprise child team",
};

function stripControlCharacters(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim();
}

function report(
  client: Client,
  failure: {
    reason: string;
    message: string;
    remote?: string;
    action?: string;
    resource?: string;
  }
): number {
  const payload: Parameters<typeof outputAgentError>[1] = {
    status: AGENT_STATUS.ERROR,
    reason: failure.reason,
    message: failure.message,
  };

  if (failure.remote) {
    payload.data = { remoteMessage: failure.remote };
  }

  if (failure.action) {
    payload.action = failure.action;
  }

  if (failure.resource) {
    payload.resource = failure.resource;
  }

  outputAgentError(client, payload, 1);
  output.error(failure.message);

  if (failure.remote) {
    output.log(`  Vercel API: ${failure.remote}`);
  }

  return 1;
}
