import type Client from '../client';
import { withGlobalFlags } from '../agent-output';
import { isAPIError } from '../errors-ts';
import { formatHelpSelector } from './format-help-selector';
import type { Integration, IntegrationProduct } from './types';

/** Auto-provision error codes that are about which billing plan to use. */
const BILLING_PLAN_ERROR_CODES = new Set([
  'billing_plan_required',
  'prepayment_not_supported',
]);

/**
 * Auto-provision returns these as a generic `bad_request`, so the message is
 * the only signal: `Billing plan not found: <id>. Available plans: ...` and
 * `Billing plan is disabled: <id>`.
 */
const BILLING_PLAN_ERROR_MESSAGE = /^Billing plan (?:not found|is disabled)\b/;

export function isBillingPlanError(error: unknown): boolean {
  if (!isAPIError(error)) {
    return false;
  }
  return (
    BILLING_PLAN_ERROR_CODES.has(error.code) ||
    // Plan errors that list the valid plans as data.
    Array.isArray(error.meta?.plans) ||
    BILLING_PLAN_ERROR_MESSAGE.test(error.serverMessage ?? '')
  );
}

/**
 * The argument `integration billing-plans` and `integration add` take for a
 * product: the integration slug, or `<integration>/<product>` when the
 * integration has more than one product. A slug that is not safe to print in
 * a command becomes a placeholder.
 */
export function getProductArgument(
  integration: Pick<Integration, 'slug' | 'products'>,
  product: Pick<IntegrationProduct, 'slug'>
): string {
  const integrationSlug = formatHelpSelector(integration.slug, '<INTEGRATION>');
  if ((integration.products?.length ?? 0) <= 1) {
    return integrationSlug;
  }
  return `${integrationSlug}/${formatHelpSelector(product.slug, '<PRODUCT>')}`;
}

/**
 * After a failed `integration add`, points at `integration billing-plans`
 * when the error was about the billing plan. Returns undefined for any other
 * error.
 */
export function getBillingPlanErrorHint(
  client: Client,
  error: unknown,
  integration: Pick<Integration, 'slug' | 'products'>,
  product: Pick<IntegrationProduct, 'slug'>
): string | undefined {
  if (!isBillingPlanError(error)) {
    return undefined;
  }
  const command = withGlobalFlags(
    client,
    `integration billing-plans ${getProductArgument(integration, product)}`
  );
  return `Run \`${command}\` to list the billing plans available to this team, then pass a plan ID with --billing-plan.`;
}
