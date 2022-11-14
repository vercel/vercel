const fetch = require('node-fetch');
const retryBailByDefault = require('./retry-bail-by-default.js');

const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

async function fetchRetry(url, ...rest) {
  if (!ABSOLUTE_URL_PATTERN.test(url)) {
    throw new Error(`fetch url must be absolute: "${url}"`);
  }

  return await retryBailByDefault(
    async canRetry => {
      try {
        return await fetch(url, ...rest);
      } catch (error) {
        if (error.type === 'request-timeout') {
          // FetchError: network timeout at: ...
          throw canRetry(error);
        } else if (error.code === 'ENOTFOUND') {
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
    { factor: 2, retries: 3 }
  );
}

module.exports = fetchRetry;
