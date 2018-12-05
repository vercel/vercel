import ms from 'ms';
import chalk from 'chalk';
import errorOutput from './output/error';
import info from './output/info';

export function handleError(err, { debug = false } = {}) {
  // Coerce Strings to Error instances
  if (typeof err === 'string') {
    err = new Error(err);
  }

  if (debug) {
    console.log(`> [debug] handling error: ${err.stack}`);
  }

  if (err.status === 403) {
    console.error(
      errorOutput('Authentication error. Run `now login` to log-in again.')
    );
  } else if (err.status === 429) {
    if (err.retryAfter === 'never') {
      console.error(errorOutput(err.message));
    } else if (err.retryAfter === null) {
      console.error(errorOutput('Rate limit exceeded error. Please try later.'));
    } else {
      console.error(
        errorOutput(
          `Rate limit exceeded error. Try again in ${
            ms(err.retryAfter * 1000, { long: true })
            }, or upgrade your account by running ` +
            `${chalk.gray('`')}${chalk.cyan('now upgrade')}${chalk.gray('`')}`
        )
      );
    }
  } else if (err.message) {
    console.error(errorOutput(err.message));
  } else if (err.status === 500) {
    console.error(errorOutput('Unexpected server error. Please retry.'));
  } else if (err.code === 'USER_ABORT') {
    info('Aborted');
  } else {
    console.error(
      error(`Unexpected error. Please try again later. (${err.message})`)
    );
  }
}

export const error = errorOutput;

export async function responseError(res, fallbackMessage = null, parsedBody = {}) {
  let message;
  let bodyError;

  if (res.status >= 400 && res.status < 500) {
    let body;

    try {
      body = await res.json();
    } catch (err) {
      body = parsedBody;
    }

    // Some APIs wrongly return `err` instead of `error`
    bodyError = body.error || body.err || {};
    message = bodyError.message;
  }

  if (message == null) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  const err = new Error(`${message} (${res.status})`);

  err.status = res.status;
  err.serverMessage = message;

  // Copy every field that was added manually to the error
  if (bodyError) {
    for (const field of Object.keys(bodyError)) {
      if (field !== 'message') {
        err[field] = bodyError[field];
      }
    }
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');

    if (retryAfter) {
      err.retryAfter = parseInt(retryAfter, 10);
    }
  }

  return err;
}

export async function responseErrorMessage(res, fallbackMessage = null) {
  let message;

  if (res.status >= 400 && res.status < 500) {
    let body;

    try {
      body = await res.json();
    } catch (err) {
      body = {};
    }

    // Some APIs wrongly return `err` instead of `error`
    message = (body.error || body.err || {}).message;
  }

  if (message == null) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  return `${message} (${res.status})`;
}

export async function reportError(sentry, error) {
  // Do not report errors while developing
  if (process.pkg) {
    sentry.captureException(error);
  }

  const client = sentry.getCurrentHub().getClient();

  if (client) {
    await client.close();
  }
};
