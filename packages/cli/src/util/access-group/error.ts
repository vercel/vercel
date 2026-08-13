import { isAPIError } from '../errors-ts';
import { printError } from '../error';
import output from '../../output-manager';

export function handleAccessGroupError(err: unknown): number {
  if (isAPIError(err)) {
    switch (err.status) {
      case 404:
        output.error('Access group not found.');
        return 1;
      case 400:
        output.error(err.serverMessage || 'The request was invalid.');
        return 1;
      case 403:
        output.error(
          err.serverMessage ||
            'You do not have permission to manage access groups on this team.'
        );
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
