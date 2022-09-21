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
const { bold, gray, red } = require('chalk');
const { format, inspect } = require('util');

/**
 * An simple output helper which accumulates error and debug log messages in
 * memory for potential persistance to disk while immediately outputting errors
 * and debug messages, when the `--debug` flag is set, to `stderr`.
 */
class WorkerOutput {
  debugLog = [];
  logFile = null;

  constructor({ debug = true }) {
    this.debugOutputEnabled = debug;
  }

  debug(...args) {
    this.print('debug', args);
  }

  error(...args) {
    this.print('error', args);
  }

  print(type, args) {
    const str = format(
      ...args.map(s => (typeof s === 'string' ? s : inspect(s)))
    );
    this.debugLog.push(`[${new Date().toISOString()}] [${type}] ${str}`);
    if (type === 'debug' && this.debugOutputEnabled) {
      console.error(
        `${gray('>')} ${bold('[debug]')} ${gray(
          `[${new Date().toISOString()}]`
        )} ${str}`
      );
    } else if (type === 'error') {
      console.error(`${red(`Error:`)} ${str}`);
    }
  }

  setLogFile(file) {
    // wire up the exit handler the first time the log file is set
    if (this.logFile === null) {
      process.on('exit', () => {
        if (this.debugLog.length) {
          fs.outputFileSync(this.logFile, this.debugLog.join('\n'));
        }
      });
    }
    this.logFile = file;
  }
}

const output = new WorkerOutput({
  // enable the debug logging if the `--debug` is set or if this worker script
  // was directly executed
  debug: process.argv.includes('--debug') || !process.connected,
});

process.on('unhandledRejection', err => {
  output.error('Exiting worker due to unhandled rejection:', err);
  process.exit(1);
});

const defaultUpdateCheckInterval = 1000 * 60 * 60 * 24 * 7; // 1 week

// this timer will prevent this worker process from running longer than 10s
const timer = setTimeout(() => {
  output.error('Worker timed out after 10 seconds');
  process.exit(1);
}, 10000);

// wait for the parent to give us the work payload
process.once('message', async msg => {
  output.debug('Received message from parent:', msg);

  output.debug('Disconnecting from parent');
  process.disconnect();

  const { cacheFile, distTag, name, updateCheckInterval } = msg;
  const cacheFileParsed = path.parse(cacheFile);
  await fs.mkdirp(cacheFileParsed.dir);

  output.setLogFile(
    path.join(cacheFileParsed.dir, `${cacheFileParsed.name}.log`)
  );

  const lockFile = path.join(
    cacheFileParsed.dir,
    `${cacheFileParsed.name}.lock`
  );

  try {
    // check for a lock file and either bail if running or write our pid and continue
    output.debug(`Checking lock file: ${lockFile}`);
    if (await isRunning(lockFile)) {
      output.debug('Worker already running, exiting');
      process.exit(1);
    }
    output.debug(`Initializing lock file with pid ${process.pid}`);
    await fs.writeFile(lockFile, String(process.pid), 'utf-8');

    // fetch the latest version from npm
    const agent = new HttpsAgent({
      keepAlive: true,
      maxSockets: 15, // See: `npm config get maxsockets`
    });
    const headers = {
      accept:
        'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
    };
    const url = `https://registry.npmjs.org/${name}`;
    output.debug(`Fetching ${url}`);
    const res = await fetch(url, { agent, headers });
    const json = await res.json();
    const tags = json['dist-tags'];
    const version = tags[distTag];

    if (version) {
      output.debug(`Found dist tag "${distTag}" with version "${version}"`);
    } else {
      output.error(`Dist tag "${distTag}" not found`);
      output.debug('Available dist tags:', Object.keys(tags));
    }

    output.debug(`Writing cache file: ${cacheFile}`);
    await fs.outputJSON(cacheFile, {
      expireAt:
        Date.now() + (updateCheckInterval || defaultUpdateCheckInterval),
      notified: false,
      version,
    });
  } catch (err) {
    output.error(`Failed to get package info:`, err);
  } finally {
    clearTimeout(timer);

    output.debug(`Releasing lock file: ${lockFile}`);
    await fs.remove(lockFile);

    output.debug(`Worker finished successfully!`);

    // force the worker to exit
    process.exit(0);
  }
});

// signal the parent process we're ready
if (process.connected) {
  output.debug("Notifying parent we're ready");
  process.send({ type: 'ready' });
} else {
  console.error('No IPC bridge detected, exiting');
  process.exit(1);
}

async function isRunning(lockFile) {
  try {
    const pid = parseInt(await fs.readFile(lockFile, 'utf-8'));
    output.debug(`Found lock file with pid: ${pid}`);

    // checks for existence of a process; throws if not found
    process.kill(pid, 0);

    // process is still running
    return true;
  } catch (err) {
    // lock file does not exist or process is not running and pid is stale
    output.debug(`Resetting lock file: ${err.toString()}`);
    await fs.remove(lockFile);
    return false;
  }
}
