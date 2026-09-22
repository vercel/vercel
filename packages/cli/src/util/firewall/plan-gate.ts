import { isAPIError } from '../errors-ts';
import { apiServerMessage } from './server-message';
import type { FirewallPlanInfo } from './format';
import type {
  BypassListResponse,
  BypassRule,
  ProjectSecurityResponse,
} from './types';

/**
 * Whether an error indicates the endpoint is gated behind the account's plan
 * rather than having genuinely failed. The bypass API answers 402 when the
 * plan does not include IP Bypass.
 *
 * Deliberately narrow: 403 means the user lacks access and 404 means the
 * resource is missing. Both are real failures and must still surface.
 */
function isPlanGatedError(error: unknown): boolean {
  return isAPIError(error) && error.status === 402;
}

/**
 * The API's explanation of the plan gate, which names the qualifying plans and
 * the team. Falls back to our own wording when the response carried no message,
 * so the reason is never reported as the bare sentinel.
 */
function planGateMessage(error: unknown): string {
  return (
    apiServerMessage(error) ?? 'IP Bypass requires a Pro or Enterprise plan.'
  );
}

/** Why the bypass list is absent, reported in `--json` output. */
export interface BypassUnavailable {
  reason: 'plan';
  message: string;
}

export interface BypassOutcome {
  /** `null` when the bypass API was unreadable, as opposed to `[]` for none. */
  bypass: BypassRule[] | null;
  /**
   * Why `bypass` is null, for the JSON consumers that cannot otherwise tell a
   * plan-gated account apart from a project with no bypasses configured.
   */
  unavailable?: BypassUnavailable;
}

/**
 * Read a settled bypass request, degrading to `null` when the plan gate closed
 * rather than failing the command around it. Any other rejection is rethrown:
 * the rest of the output is only worth rendering when the bypass list is absent
 * for a reason the caller can explain.
 *
 * Shared by `firewall status` and `firewall overview`, which must agree on what
 * counts as a plan gate.
 */
export function readBypassResult(
  result: PromiseSettledResult<BypassListResponse>
): BypassOutcome {
  if (result.status === 'fulfilled') {
    return { bypass: result.value.result };
  }
  if (!isPlanGatedError(result.reason)) {
    throw result.reason;
  }
  return {
    bypass: null,
    unavailable: { reason: 'plan', message: planGateMessage(result.reason) },
  };
}

/**
 * Fold the project's own entitlements into the team's.
 *
 * Security+ is sold both team-wide and per project, and `fetchPlanInfo` only
 * sees the team — so a project that carries it alone was reported as lacking
 * it, and `firewall status` told those accounts OWASP "requires Security+"
 * when they had already bought it. This is the dashboard's
 * `isSecurityPlusEnabled`, which reads `team.securityPlus.enabled` or
 * `project.security.securityPlus`.
 *
 * Enterprise is left alone: it grants the OWASP entitlement but is not
 * Security+, and the two are not interchangeable for everything that reads
 * them.
 */
export function resolveFirewallEntitlements(
  planInfo: FirewallPlanInfo | undefined,
  project: ProjectSecurityResponse
): FirewallPlanInfo {
  return {
    isEnterprise: planInfo?.isEnterprise,
    hasSecurityPlus: Boolean(
      planInfo?.hasSecurityPlus || project.security?.securityPlus
    ),
  };
}
