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
const fs = require('fs-extra');
const path = require('path');
const { Agent: HttpsAgent } = require('https');

process.on('unhandledRejection', err => {
  if (process.connected) {
    console.error('Exiting update worker due to error:');
    console.error(err);
  }
  process.exit(1);
});

const defaultUpdateCheckInterval = 1000 * 60 * 60 * 24 * 7; // 1 week

// this timer will prevent this worker process from running longer than 10s
const timer = setTimeout(() => process.exit(1), 10000);

// wait for the parent to give us the work payload
process.once('message', async msg => {
  process.disconnect();

  const { cacheFile, distTag, name, updateCheckInterval } = msg;
  const cacheFileParsed = path.parse(cacheFile);
  await fs.mkdirp(cacheFileParsed.dir);

  // check for a lock file and either bail if running or write our pid and continue
  const lockFile = path.join(
    cacheFileParsed.dir,
    `${cacheFileParsed.name}.lock`
  );
  if (await isRunning(lockFile)) {
    return;
  }
  await fs.writeFile(lockFile, String(process.pid), 'utf-8');

  // fetch the latest version from npm
  try {
    const agent = new HttpsAgent({
      keepAlive: true,
      maxSockets: 15, // See: `npm config get maxsockets`
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

    await fs.outputJSON(cacheFile, {
      expireAt:
        Date.now() + (updateCheckInterval || defaultUpdateCheckInterval),
      notified: false,
      version,
    });
  } finally {
    clearTimeout(timer);
    await fs.remove(lockFile);
  }
});

// signal the parent process we're ready
if (process.connected && process.send) {
  process.send({ type: 'ready' });
} else {
  console.error('No IPC bridge detected, exiting');
  process.exit(1);
}

async function isRunning(lockFile) {
  try {
    const pid = parseInt(await fs.readFile(lockFile, 'utf-8'));
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // lock file does not exist or pid is stale
    await fs.remove(lockFile);
    return false;
  }
}
