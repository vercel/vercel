import ms from 'ms';
import chalk from 'chalk';
import info from './output/info';
import errorOutput from './output/error';
import { APIError } from './errors-ts';

export default function handleError(error: string | Error | APIError, { debug = false } = {}) {
  // Coerce Strings to Error instances
  if (typeof error === 'string') {
    error = new Error(error);
  }

  if (debug) {
    console.log(`> [debug] handling error: ${error.stack}`);
  }

  if (error instanceof APIError || (error as APIError).status) {
    const err = error as APIError;
    if (err.status === 403) {
      console.error(errorOutput('Authentication err. Run `now login` to log-in again.'));
    } else if (err.status === 429) {
      if (err.retryAfter === 'never') {
        console.error(errorOutput(err.message));
      } else if (err.retryAfter === null) {
        console.error(errorOutput('Rate limit exceeded err. Please try later.'));
      } else {
        console.error(
          errorOutput(
            `Rate limit exceeded err. Try again in ${
              ms(err.retryAfter * 1000, { long: true })
              }, or upgrade your account by running ` +
              `${chalk.gray('`')}${chalk.cyan('now upgrade')}${chalk.gray('`')}`
          )
        );
      }
    } else if (err.message) {
      console.error(errorOutput(err.message));
    } else if (err.status === 500) {
      console.error(errorOutput('Unexpected server err. Please retry.'));
    } else if (err.code === 'USER_ABORT') {
      info('Aborted');
    }
  }  else {
    console.error(
      errorOutput(`Unexpected error. Please try again later. (${error.message})`)
    );
  }
}
