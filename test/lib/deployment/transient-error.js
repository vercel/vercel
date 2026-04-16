const { reportTransientError } = require('./metrics');

const TRANSIENT_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
]);

function isTransientError(error) {
  return (
    error.type === 'request-timeout' || TRANSIENT_ERROR_CODES.has(error.code)
  );
}

/**
 * Check if an error is transient and report it to Datadog if so.
 * Returns true if the error is transient, false otherwise.
 *
 * @param {Error} error
 * @param {string} location - identifies the call site (e.g. 'deployment_poll')
 * @returns {boolean}
 */
function handleTransientError(error, location) {
  if (!isTransientError(error)) return false;
  reportTransientError({ location });
  return true;
}

module.exports = { isTransientError, handleTransientError };
