import ms from 'ms';

export function handleError (err) {
  if (403 === err.status) {
    error('Authentication error. Run `now -L` or `now --login` to log-in again.');
  } else if (429 === err.status) {
    if (null != err.retryAfter) {
      error('Rate limit exceeded error. Try again in ' +
          ms(err.retryAfter * 1000, { long: true }) +
          ', or upgrade your account: https://zeit.co/now#pricing');
    } else {
      error('Rate limit exceeded error. Please try later.');
    }
  } else if (err.userError) {
    error(err.message);
  } else if (500 === err.status) {
    error('Unexpected server error. Please retry.');
  } else {
    error(`Unexpected error. Please try later. (${err.message})`);
  }
}

export function error (err) {
  console.error(`> \u001b[31mError!\u001b[39m ${err}`);
}
