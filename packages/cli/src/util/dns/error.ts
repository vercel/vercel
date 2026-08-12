import { isAPIError } from '../errors-ts';
import { printError } from '../error';
import output from '../../output-manager';

/**
 * Maps API errors for single-DNS-record operations (inspect/update)
 * to user-facing messages. Returns the exit code.
 */
export function handleDNSRecordError(err: unknown): number {
  if (isAPIError(err)) {
    switch (err.status) {
      case 404:
        output.error('DNS record not found');
        return 1;
      case 403:
        output.error("You don't have permission to access this DNS record.");
        return 1;
      case 400:
        output.error(err.serverMessage || 'The request was invalid.');
        return 1;
      case 429:
        output.error(
          err.serverMessage || 'Too many requests. Try again shortly.'
        );
        return 1;
    }
  }

  printError(err);
  return 1;
}
