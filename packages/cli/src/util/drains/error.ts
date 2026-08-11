import { isAPIError } from '../errors-ts';
import { printError } from '../error';
import output from '../../output-manager';

export function handleDrainsError(err: unknown): number {
  if (isAPIError(err)) {
    switch (err.status) {
      case 404:
        output.error('Drain not found.');
        return 1;
      case 400:
        if (err.code === 'drain_enable_not_allowed') {
          output.error(
            "This drain was disabled by Vercel and can't be resumed."
          );
          return 1;
        }
        output.error(err.serverMessage || 'The request was invalid.');
        return 1;
      case 403:
        output.error(
          err.serverMessage ||
            'Drains require a Pro or Enterprise plan and the Drains permission on this team. See https://vercel.com/docs/drains'
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
