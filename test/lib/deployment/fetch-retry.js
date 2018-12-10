const fetch = require('node-fetch');
const retryBailByDefault = require('./retry-bail-by-default.js');

async function fetchRetry (...args) {
  return await retryBailByDefault(async (canRetry) => {
    try {
      return await fetch(...args);
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        // getaddrinfo ENOTFOUND api.zeit.co like some transitional dns issue
        throw canRetry(error);
      }
      throw error;
    }
  }, { factor: 1, retries: 3 });
}

module.exports = fetchRetry;
