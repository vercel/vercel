const fetch = require('node-fetch');
const retryBailByDefault = require('./retry-bail-by-default.js');

async function fetchRetry(...args) {
  return await retryBailByDefault(
    async canRetry => {
      try {
        return await fetch(...args);
      } catch (error) {
        if (error.code === 'ENOTFOUND') {
          // getaddrinfo ENOTFOUND api.vercel.com like some transient dns issue
          throw canRetry(error);
        } else if (error.code === 'ETIMEDOUT') {
          // request to https://api-gru1.vercel.com/v3/now/deployments/dpl_FBWWhpQomjgwjJLu396snLrGZYCm failed, reason:
          // connect ETIMEDOUT 18.228.143.224:443
          throw canRetry(error);
        } else if (error.code === 'ECONNREFUSED') {
          // request to https://test2020-dhdy1xrfa.vercel.app/blog/post-3 failed, reason:
          // connect ECONNREFUSED 76.76.21.21:443
          throw canRetry(error);
        } else if (error.code === 'ECONNRESET') {
          throw canRetry(error);
        }
        throw error;
      }
    },
    { factor: 1, retries: 3 }
  );
}

module.exports = fetchRetry;
