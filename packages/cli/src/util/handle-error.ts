import bytes from 'bytes';
import info from './output/info';
import errorOutput from './output/error';
import { APIError } from './errors-ts';
import { getCommandName } from './pkg-name';

export default function handleError(error: unknown, { debug = false } = {}) {
  // Coerce Strings to Error instances
  if (typeof error === 'string') {
    error = new Error(error);
  }

  const apiError = error as APIError;
  const { message, stack, status, code, sizeLimit } = apiError;

  if (debug) {
    console.log(`> [debug] handling error: ${stack}`);
  }

  if (status === 403) {
    console.error(
      errorOutput(
        message ||
          `Authentication error. Run ${getCommandName(
            'login'
          )} to log-in again.`
      )
    );
  } else if (status === 429) {
    // Rate limited: display the message from the server-side,
    // which contains more details
    console.error(errorOutput(message));
  } else if (code === 'size_limit_exceeded') {
    console.error(
      errorOutput(`File size limit exceeded (${bytes(sizeLimit)})`)
    );
  } else if (message) {
    console.error(errorOutput(apiError));
  } else if (status === 500) {
    console.error(errorOutput('Unexpected server error. Please retry.'));
  } else if (code === 'USER_ABORT') {
    info('Canceled');
  } else {
    console.error(
      errorOutput(`Unexpected error. Please try again later. (${message})`)
    );
  }
}
