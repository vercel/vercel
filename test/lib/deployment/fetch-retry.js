const fetch = require('node-fetch');
const retryBailByDefault = require('./retry-bail-by-default.js');

async function fetchRetry (...args) {
  return await retryBailByDefault(async (canRetry) => {
    try {
      return await fetch(...args);
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        // getaddrinfo ENOTFOUND api.zeit.co like some transient dns issue
        throw canRetry(error);
      } else
      if (error.code === 'ETIMEDOUT') {
        // request to https://api-gru1.zeit.co/v3/now/deployments/dpl_FBWWhpQomjgwjJLu396snLrGZYCm failed, reason:
        // connect ETIMEDOUT 18.228.143.224:443
        throw canRetry(error);
      }
      throw error;
    }
  }, { factor: 1, retries: 3 });
}

module.exports = fetchRetry;
