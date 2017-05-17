// Packages
const ms = require('ms')
const chalk = require('chalk')

const error = require('./utils/output/error')
const info = require('./utils/output/info')

function handleError(err) {
  // Coerce Strings to Error instances
  if (typeof err === 'string') {
    err = new Error(err)
  }

  if (err.status === 403) {
    error(
      'Authentication error. Run `now -L` or `now --login` to log-in again.'
    )
  } else if (err.status === 429) {
    if (err.retryAfter === 'never') {
      error(err.message)
    } else if (err.retryAfter === null) {
      error('Rate limit exceeded error. Please try later.')
    } else {
      error(
        'Rate limit exceeded error. Try again in ' +
          ms(err.retryAfter * 1000, { long: true }) +
          ', or upgrade your account by runnung ' +
          `${chalk.gray('`')}${chalk.cyan('now upgrade')}${chalk.gray('`')}`
      )
    }
  } else if (err.userError) {
    error(err.message)
  } else if (err.status === 500) {
    error('Unexpected server error. Please retry.')
  } else if (err.code === 'USER_ABORT') {
    info('Aborted')
  } else {
    error(`Unexpected error. Please try later. (${err.message})`)
  }
}

module.exports = {
  handleError,
  error
}
