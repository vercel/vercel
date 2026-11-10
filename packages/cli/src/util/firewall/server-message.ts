import { isAPIError } from '../errors-ts';

/**
 * The sentinel `responseError` substitutes when a failed response carried no
 * message of its own. It reaches `serverMessage` as an ordinary string, so an
 * absent message cannot be detected by emptiness alone.
 */
const NO_SERVER_MESSAGE = 'Response Error';

/**
 * What the API said went wrong, when it said anything.
 *
 * `undefined` for an error that is not an `APIError` and for one whose
 * response carried no message — reporting the sentinel verbatim tells a
 * reader nothing and reads like a failure of ours, so every caller wants its
 * own wording in that case.
 */
export function apiServerMessage(error: unknown): string | undefined {
  const message = isAPIError(error) ? error.serverMessage : undefined;
  return message && message !== NO_SERVER_MESSAGE ? message : undefined;
}
