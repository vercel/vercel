import { errorToString } from '@vercel/error-utils';
import output from '../../output-manager';
import { isAPIError } from '../errors-ts';
import { getCommandName } from '../pkg-name';

/**
 * Handle errors from the custom environment purchase settings API.
 */
export function handleCustomEnvironmentPurchaseError(err: unknown): number {
  if (isAPIError(err)) {
    if (err.code === 'upgrade_required') {
      output.error(
        'Custom environment purchases require an active Pro or Enterprise plan.'
      );
      output.log(
        `Upgrade with ${getCommandName('buy pro')} or visit ${output.link('vercel.com/pricing', 'https://vercel.com/pricing')}.`
      );
      return 1;
    }
    if (err.code === 'custom_environments_not_available_to_purchase') {
      output.error(
        err.serverMessage ||
          'Custom environments are not available to purchase on this team.'
      );
      return 1;
    }
    if (err.code === 'custom_environments_in_use') {
      output.error(
        err.serverMessage ||
          'This project is using more custom environments than the requested capacity allows.'
      );
      return 1;
    }
    if (err.code === 'bad_request' && err.serverMessage) {
      output.error(err.serverMessage);
      return 1;
    }
    if (err.code === 'forbidden') {
      output.error(
        err.serverMessage ||
          'You do not have permission to update custom environment capacity for this project.'
      );
      return 1;
    }
  }

  output.error(
    'An error occurred while updating custom environment capacity. Please try again later.'
  );
  output.debug(`Server response: ${errorToString(err)}`);
  return 1;
}
