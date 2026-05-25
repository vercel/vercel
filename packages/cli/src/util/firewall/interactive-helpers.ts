import { isIP } from 'node:net';
import type Client from '../client';
import getScope from '../get-scope';
import { CONDITION_TYPES, type ConditionTypeMeta } from './condition-types';

export interface PlanInfo {
  isEnterprise: boolean;
  hasSecurityPlus: boolean;
}

/**
 * Fetch team plan info from the API for condition type filtering.
 * Returns default (non-enterprise, no security-plus) if the fetch fails.
 */
export async function fetchPlanInfo(client: Client): Promise<PlanInfo> {
  try {
    const { team } = await getScope(client);
    if (team) {
      return {
        isEnterprise: team.billing.plan === 'enterprise',
        hasSecurityPlus:
          (team as unknown as { securityPlus?: { enabled?: boolean } })
            .securityPlus?.enabled === true,
      };
    }
  } catch {
    // If we can't fetch team info, default to hiding plan-gated types
  }
  return { isEnterprise: false, hasSecurityPlus: false };
}

/**
 * Filter condition types by plan entitlements.
 * Enterprise types hidden for non-enterprise, Security Plus types for non-security-plus.
 */
export function getAvailableConditionTypes(
  planInfo?: PlanInfo
): ConditionTypeMeta[] {
  return CONDITION_TYPES.filter(ct => {
    if (ct.deprecated) return false;
    if (ct.planRequirement === 'enterprise' && !planInfo?.isEnterprise)
      return false;
    if (ct.planRequirement === 'security-plus' && !planInfo?.hasSecurityPlus)
      return false;
    return true;
  });
}

/**
 * Human-readable action label for interactive prompts.
 */
export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    deny: 'Deny — Block traffic (403)',
    challenge: 'Challenge — Verify at security checkpoint',
    log: 'Log — Monitor without blocking',
    bypass: 'Bypass — Skip other custom rules',
    rate_limit: 'Rate Limit — Enforce request limits',
    redirect: 'Redirect — Send to a different URL',
  };
  return labels[action] || action;
}

/**
 * Human-readable operator label for interactive prompts.
 */
export function getOperatorDisplayName(op: string, neg: boolean): string {
  const labels: Record<string, [string, string]> = {
    eq: ['equals', 'does not equal'],
    inc: ['is any of', 'is not any of'],
    sub: ['contains', 'does not contain'],
    pre: ['starts with', 'does not start with'],
    suf: ['ends with', 'does not end with'],
    re: ['matches regex', 'does not match regex'],
    ex: ['exists', 'does not exist'],
  };
  const pair = labels[op];
  if (pair) return neg ? pair[1] : pair[0];
  return neg ? `NOT ${op}` : op;
}

/**
 * Per-type value validation for the interactive builder.
 * Only enforces format constraints where the API strictly requires a specific format.
 * Most types accept any string — the API validates semantics.
 */
export function validateConditionValue(
  val: string,
  meta: ConditionTypeMeta | undefined
): string | true {
  if (!meta?.valueValidation) return true;

  switch (meta.valueValidation) {
    case 'path':
      if (!val.startsWith('/')) return 'Path must start with /';
      return true;
    case 'ip': {
      if (isIP(val)) return true;
      // Check CIDR
      const slashIdx = val.lastIndexOf('/');
      if (slashIdx !== -1) {
        const ip = val.slice(0, slashIdx);
        const prefix = Number.parseInt(val.slice(slashIdx + 1), 10);
        if (isIP(ip) && !Number.isNaN(prefix) && prefix >= 0) return true;
      }
      return 'Please enter a valid IP address or CIDR range.';
    }
    case 'hostname':
      if (!/^[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*$/.test(val))
        return 'Please enter a valid hostname.';
      return true;
    case 'digits':
      if (!/^\d+$/.test(val)) return 'Please enter digits only.';
      return true;
    default:
      return true;
  }
}
