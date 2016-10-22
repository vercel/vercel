// Packages
import ms from 'ms'
import chalk from 'chalk'

export function handleError(err) {
  if (err.status === 403) {
    error('Authentication error. Run `now -L` or `now --login` to log-in again.')
  } else if (err.status === 429) {
    if (err.retryAfter === null) {
      error('Rate limit exceeded error. Please try later.')
    } else {
      error('Rate limit exceeded error. Try again in ' +
          ms(err.retryAfter * 1000, {long: true}) +
          ', or upgrade your account: https://zeit.co/now#pricing')
    }
  } else if (err.userError) {
    error(err.message)
  } else if (err.status === 500) {
    error('Unexpected server error. Please retry.')
  } else {
    error(`Unexpected error. Please try later. (${err.message})`)
  }
}

export function error(err) {
  console.error(`> ${chalk.red('Error!')} ${err}`)
}
