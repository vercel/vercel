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

module.exports = { isTransientError };
