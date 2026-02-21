import { errorToString } from '@vercel/error-utils';
import output from '../../output-manager';
import { isAPIError } from '../errors-ts';

const getBillingUrl = (teamSlug: string) =>
  `https://vercel.com/${teamSlug}/~/settings/billing`;

/**
 * Handle errors from the billing buy API. All purchase flows (credits, addon, pro,
 * v0, etc.) can use this to show consistent messages and return the CLI exit code.
 *
 * @param teamSlug - When provided, the missing_stripe_customer message includes a link to that team's billing settings.
 */
export function handlePurchaseError(err: unknown, teamSlug?: string): number {
  if (isAPIError(err)) {
    if (err.code === 'missing_stripe_customer') {
      const dashboardHint = teamSlug
        ? ` Please add one: ${output.link(getBillingUrl(teamSlug), getBillingUrl(teamSlug))}`
        : ` Please add one in the ${output.link('Vercel dashboard', 'https://vercel.com/dashboard')}.`;
      output.error(
        `Your team does not have a payment method on file.${dashboardHint}`
      );
      return 1;
    }
    if (err.status === 402 || err.code === 'payment_failed') {
      output.error(
        'Payment failed. Please check the payment method on file for your team.'
      );
      return 1;
    }
    if (
      err.code === 'purchase_create_failed' ||
      err.code === 'purchase_confirm_failed' ||
      err.code === 'purchase_complete_failed'
    ) {
      output.error(
        'An error occurred while processing your purchase. Please try again later.'
      );
      output.debug(`Error code: ${err.code}`);
      return 1;
    }
  }

  output.error(
    'An unexpected error occurred while completing your purchase. Please try again later.'
  );
  output.debug(`Server response: ${errorToString(err)}`);
  return 1;
}
