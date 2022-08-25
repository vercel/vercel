/**
 * This file is spawned in the background and checks npm for the latest version
 * of the CLI, then writes the version to the cache file.
 *
 * NOTE: Since this file runs asynchronously in the background, it's possible
 * for multiple instances of this file to be running at the same time leading
 * to a race condition where the most recent instance will overwrite the
 * previous cache file resetting the `notified` flag and cause the update
 * notification to appear for multiple consequetive commands. Not the end of
 * the world, but something to be aware of.
 */

const fetch = require('node-fetch');
const { Agent: HttpsAgent } = require('https');
const { outputJSON } = require('fs-extra');

process.on('unhandledRejection', err => {
  console.error('Exiting update worker due to error:');
  console.error(err);
  process.exit(1);
});

process.on('message', async msg => {
  try {
    const pending = fetchLatest(msg);
    if (msg.wait) {
      await pending;
    }
  } finally {
    process.disconnect();
  }
});

/**
 * Fetch the latest version from npm. We do this in a separate function so that
 * destructuring our required arguments acts as a validator of sorts.
 */
async function fetchLatest({ cacheFile, distTag, name, updateCheckInterval }) {
  // See: `npm config get maxsockets`
  const agent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 15,
  });
  const headers = {
    accept:
      'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
  };

  const url = `https://registry.npmjs.org/${name}`;
  const res = await fetch(url, { agent, headers });
  const json = await res.json();
  const tags = json['dist-tags'];
  const version = tags[distTag];

  await outputJSON(cacheFile, {
    expireAt: Date.now() + updateCheckInterval,
    notified: false,
    version,
  });
}

/**
 * Signal the parent process we're ready to fetch.
 */
if (process.connected && process.send) {
  process.send({ type: 'ready' });
}
