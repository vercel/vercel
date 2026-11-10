const https = require('https');

/**
 * Fetches the dist tags from npm for a given package.
 *
 * This is a shared CJS module used by both:
 * - `get-latest-worker.cjs` (background cache refresh, spawned process)
 * - `get-latest-version/index.ts` (fresh pre-prompt lookup, main process)
 *
 * @param {string} name The package name
 * @param {{ timeout?: number }} [options]
 * @param {number} [options.timeout] Maximum time to wait, in milliseconds
 * @returns {Promise<Record<string, string> | undefined>} A map of dist tags
 * to versions, or `undefined` on any error/timeout.
 */
function fetchDistTags(name, options) {
  const timeout = (options && options.timeout) || 3000;
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 15, // See: `npm config get maxsockets`
  });
  const headers = {
    accept:
      'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
  };
  const url = `https://registry.npmjs.org/-/package/${name}/dist-tags`;

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      req.destroy();
      resolve(undefined);
    }, timeout);

    const req = https.get(url, { agent, headers }, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk;
      });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          if (res.statusCode && res.statusCode >= 400) {
            resolve(undefined);
            return;
          }
          resolve(JSON.parse(buf));
        } catch {
          resolve(undefined);
        }
      });
    });

    req.on('error', () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

module.exports = { fetchDistTags };
