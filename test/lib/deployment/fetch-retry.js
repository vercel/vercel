const retryBailByDefault = require('./retry-bail-by-default.js');

const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

function withTimeoutOptions(options = {}) {
  const { timeout, signal, ...fetchOptions } = options;

  if (typeof timeout === 'undefined') {
    return options;
  }

  const timeoutSignal = AbortSignal.timeout(timeout);

  return {
    ...fetchOptions,
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  };
}

async function fetchRetry(url, ...rest) {
  if (!ABSOLUTE_URL_PATTERN.test(url)) {
    throw new Error(`fetch url must be absolute: "${url}"`);
  }

  const [options, ...extra] = rest;
  const fetchOptions =
    options && typeof options === 'object'
      ? withTimeoutOptions(options)
      : options;

  return await retryBailByDefault(
    async canRetry => {
      try {
        const requestIds = [];
        for (let i = 60; i >= 0; i--) {
          const res = await fetch(url, fetchOptions, ...extra);

          if (res.status === 401) {
            const clonedRes = res.clone();
            const body = await clonedRes.text();

            if (body.includes('https://vercel.com/sso-api')) {
              requestIds.push(res.headers.get('x-vercel-id'));
              if (i === 0) {
                console.error(
                  `Failed request ids (because of 401s): `,
                  JSON.stringify(requestIds, null, 2)
                );
                throw new Error(
                  `Failed to fetch ${url}, received 401 status for over 1 minute`
                );
              }
            } else {
              return res;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            return res;
          }
        }
      } catch (error) {
        const errorCode = error?.code || error?.cause?.code;
        if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
          throw canRetry(error);
        } else if (errorCode === 'ENOTFOUND') {
          // getaddrinfo ENOTFOUND api.vercel.com like some transient dns issue
          throw canRetry(error);
        } else if (errorCode === 'ETIMEDOUT') {
          // request to https://api-gru1.vercel.com/v3/now/deployments/dpl_FBWWhpQomjgwjJLu396snLrGZYCm failed, reason:
          // connect ETIMEDOUT 18.228.143.224:443
          throw canRetry(error);
        } else if (errorCode === 'ECONNREFUSED') {
          // request to https://test2020-dhdy1xrfa.vercel.app/blog/post-3 failed, reason:
          // connect ECONNREFUSED 76.76.21.21:443
          throw canRetry(error);
        } else if (errorCode === 'ECONNRESET') {
          throw canRetry(error);
        }
        throw error;
      }
    },
    { factor: 2, retries: 3 }
  );
}

module.exports = fetchRetry;
