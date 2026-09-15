import { AGENT_STATUS } from '../../util/agent-output-constants';
import type { NextStep, PurchasePlan } from './buy-plan';

export interface StructuredBuyError {
  reason: string;
  message: string;
  hint?: string;
  userActionRequired?: boolean;
  next?: NextStep[];
}

/**
 * Renders the purchase plan as a single JSON object for `--format json` and
 * non-interactive mode. A buyable domain is `action_required` (exit 0): the
 * command prepared everything but a human must confirm the purchase.
 */
export function renderStructuredPlan(plan: PurchasePlan): string {
  if (!plan.ok) {
    return renderStructuredBuyError({
      reason: plan.reason,
      message: plan.message,
      hint: plan.hint,
      next: plan.next,
    });
  }
  const payload = {
    status: AGENT_STATUS.ACTION_REQUIRED,
    reason: plan.reason,
    action: plan.action,
    message: plan.message,
    domain: plan.order.domain,
    available: true,
    purchasePrice: plan.order.purchasePrice,
    renewalPrice: plan.order.renewalPrice,
    years: plan.order.years,
    ...(plan.order.autoRenew !== undefined
      ? { autoRenew: plan.order.autoRenew }
      : {}),
    userActionRequired: true,
    missingContactFields: plan.missingContactFlags,
    hint: plan.hint,
    next: plan.next,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function renderStructuredBuyError(error: StructuredBuyError): string {
  const payload = {
    status: AGENT_STATUS.ERROR,
    reason: error.reason,
    message: error.message,
    ...(error.hint ? { hint: error.hint } : {}),
    ...(error.userActionRequired ? { userActionRequired: true } : {}),
    ...(error.next?.length ? { next: error.next } : {}),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
