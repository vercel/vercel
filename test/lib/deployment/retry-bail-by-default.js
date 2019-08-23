const retry = require('async-retry');

function canRetry (error) {
  error.dontBail = true;
  return error;
}

async function retryBailByDefault (fn, opts) {
  return await retry(async () => {
    try {
      return await fn(canRetry);
    } catch (error) {
      if (error.dontBail) {
        delete error.dontBail;
      } else {
        error.bail = true;
      }
      throw error;
    }
  }, opts);
}

module.exports = retryBailByDefault;
