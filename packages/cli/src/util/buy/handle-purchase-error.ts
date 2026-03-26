import open from 'open';
import { errorToString } from '@vercel/error-utils';
import output from '../../output-manager';
import { isAPIError } from '../errors-ts';

const getBillingUrl = (teamSlug: string) =>
  `https://vercel.com/${teamSlug}/~/settings/billing`;

interface HandlePurchaseErrorOptions {
  /** When true (TTY), automatically opens the billing page in the browser for payment-related errors. */
  openBrowser?: boolean;
}

function tryOpenBillingPage(
  teamSlug: string | undefined,
  openBrowser: boolean
): void {
  if (!openBrowser) return;
  const billingUrl = teamSlug
    ? getBillingUrl(teamSlug)
    : 'https://vercel.com/dashboard';
  void open(billingUrl).catch((err: unknown) => {
    output.debug(`Failed to open browser: ${err}`);
  });
}

/**
 * Handle errors from the billing buy API. All purchase flows (credits, addon, pro,
 * v0, etc.) can use this to show consistent messages and return the CLI exit code.
 *
 * @param teamSlug - When provided, error messages include a link to that team's billing settings.
 * @param opts.openBrowser - When true, payment-related errors automatically open the billing page.
 */
export function handlePurchaseError(
  err: unknown,
  teamSlug?: string,
  opts?: HandlePurchaseErrorOptions
): number {
  const openBrowser = opts?.openBrowser ?? false;

  if (isAPIError(err)) {
    if (err.code === 'invalid_plan_iteration') {
      output.error('Your team must be on the Flex plan to purchase add-ons.');
      return 1;
    }
    if (err.code === 'missing_subscription') {
      output.error(
        'Your team does not have an active subscription. Please contact support.'
      );
      return 1;
    }
    if (err.code === 'missing_stripe_customer') {
      const billingUrl = teamSlug
        ? getBillingUrl(teamSlug)
        : 'https://vercel.com/dashboard';
      const dashboardHint = teamSlug
        ? ` Please add one: ${output.link(billingUrl, billingUrl)}`
        : ` Please add one in the ${output.link('Vercel dashboard', billingUrl)}.`;
      output.error(
        `Your team does not have a payment method on file.${dashboardHint}`
      );
      tryOpenBillingPage(teamSlug, openBrowser);
      return 1;
    }
    if (err.code === 'invalid_plan') {
      output.error("Your team's current plan does not support this purchase.");
      return 1;
    }
    if (err.code === 'already_on_plan') {
      output.error(
        'Your team already has an active subscription for this plan.'
      );
      return 1;
    }
    if (err.code === 'invalid_status') {
      output.error(
        'Your team is not in a state that allows plan changes. Please contact support.'
      );
      return 1;
    }
    if (err.code === 'forbidden') {
      output.error(
        'You do not have permission to make purchases for this team. Please contact your account administrator.'
      );
      return 1;
    }
    if (
      err.code === 'purchase_create_failed' ||
      err.code === 'purchase_confirm_failed' ||
      err.code === 'purchase_complete_failed' ||
      err.code === 'purchase_create_hosted_failed'
    ) {
      // A 402 inside a purchase_*_failed response likely indicates a
      // payment-method issue (e.g. missing or declined card), but the exact
      // cause isn't guaranteed — nudge the user to check billing settings.
      if (err.status === 402) {
        output.error(
          'Payment failed. Please check that your team has a valid payment method on file.'
        );
        tryOpenBillingPage(teamSlug, openBrowser);
        return 1;
      }
      output.error(
        'An error occurred while processing your purchase. Please try again later.'
      );
      output.debug(`Error code: ${err.code}`);
      return 1;
    }
    if (err.status === 402 || err.code === 'payment_failed') {
      output.error(
        'Payment failed. Please check the payment method on file for your team.'
      );
      tryOpenBillingPage(teamSlug, openBrowser);
      return 1;
    }
  }

  output.error(
    'An unexpected error occurred while completing your purchase. Please try again later.'
  );
  output.debug(`Server response: ${errorToString(err)}`);
  return 1;
}
