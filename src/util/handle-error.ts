import ms from 'ms';
import chalk from 'chalk';
import bytes from 'bytes';
import info from './output/info';
import errorOutput from './output/error';
import { APIError } from './errors-ts';

export default function handleError(
  error: string | Error | APIError,
  { debug = false } = {}
) {
  // Coerce Strings to Error instances
  if (typeof error === 'string') {
    error = new Error(error);
  }

  if (debug) {
    console.log(`> [debug] handling error: ${error.stack}`);
  }

  if ((<APIError>error).status === 403) {
    console.error(
      errorOutput('Authentication error. Run `now login` to log-in again.')
    );
  } else if ((<APIError>error).status === 429) {
    if ((<APIError>error).retryAfter === 'never') {
      console.error(errorOutput(error.message));
    } else if (!(<APIError>error).retryAfter) {
      console.error(
        errorOutput('Rate limit exceeded error. Please try later.')
      );
    } else {
      console.error(
        errorOutput(
          `Rate limit exceeded error. Try again in ${ms(
            ((<APIError>error).retryAfter as number) * 1000,
            { long: true }
          )}, or upgrade your plan here: ${chalk.cyan('https://zeit.co/account/plan')}`
        )
      );
    }
  } else if ((<APIError>error).code === 'size_limit_exceeded') {
    const { sizeLimit = 0 } = <APIError>error;
    console.error(
      errorOutput(`File size limit exceeded (${bytes(sizeLimit)})`)
    );
  } else if (error.message) {
    console.error(errorOutput(error.message));
  } else if ((<APIError>error).status === 500) {
    console.error(errorOutput('Unexpected server error. Please retry.'));
  } else if ((<APIError>error).code === 'USER_ABORT') {
    info('Aborted');
  } else {
    console.error(
      errorOutput(
        `Unexpected error. Please try again later. (${error.message})`
      )
    );
  }
}
