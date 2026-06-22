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
 *
 * IMPORTANT! This file must NOT depend on any 3rd party dependencies. This
 * file is NOT bundled by `esbuild` and thus any 3rd party dependencies will
 * never be available.
 */

const https = require('https');
const http = require('http');
const os = require('os');
const { mkdirSync, writeFileSync } = require('fs');
const { access, mkdir, readFile, unlink, writeFile } = require('fs/promises');
const path = require('path');
const { format, inspect } = require('util');

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

/**
 * An simple output helper which accumulates error and debug log messages in
 * memory for potential persistence to disk while immediately outputting errors
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
    // note: `args` may contain an `Error` that will be toString()'d and thus
    // no stack trace
    const str = format(
      ...args.map(s => (typeof s === 'string' ? s : inspect(s)))
    );
    this.debugLog.push(`[${new Date().toISOString()}] [${type}] ${str}`);
    if (type === 'debug' && this.debugOutputEnabled) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`> '[debug] [${new Date().toISOString()}] ${str}`);
    } else if (type === 'error') {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`Error: ${str}`);
    }
  }

  setLogFile(file) {
    // wire up the exit handler the first time the log file is set
    if (this.logFile === null) {
      process.on('exit', () => {
        if (this.debugLog.length) {
          mkdirSync(path.dirname(this.logFile), { recursive: true });
          writeFileSync(this.logFile, this.debugLog.join('\n'));
        }
      });
    }
    this.logFile = file;
  }
}

// Helpers below reference `output` so they can emit debug logs while running
// inside the worker. When the file is `require()`-d for unit tests, no debug
// output is needed, so a noop default is used.
let output = {
  debug: () => {},
  error: () => {},
  setLogFile: () => {},
};

async function fileExists(file) {
  return access(file)
    .then(() => true)
    .catch(() => false);
}

async function isRunning(lockFile) {
  try {
    const pid = parseInt(await readFile(lockFile, 'utf-8'));
    output.debug(`Found lock file with pid: ${pid}`);

    // checks for existence of a process; throws if not found
    process.kill(pid, 0);

    // process is still running
    return true;
  } catch (err) {
    if (await fileExists(lockFile)) {
      // lock file does not exist or process is not running and pid is stale
      output.debug(`Resetting lock file: ${err.toString()}`);
      await unlink(lockFile);
    }
    return false;
  }
}

/**
 * Attempts to load and return the previous `notifyAt` value.
 *
 * If the latest version is newer than the previous latest version, then
 * return `undefined` to invalidate `notifyAt` which forces the notification
 * to be displayed, otherwise keep the existing `notifyAt`.
 *
 * @param {string} cacheFile The path to the cache file
 * @param {string} version The latest version
 * @returns {number | undefined} The previous notifyAt
 */
async function getNotifyAt(cacheFile, version) {
  try {
    const old = JSON.parse(await readFile(cacheFile, 'utf-8'));
    if (old?.version && old.version === version) {
      return old.notifyAt;
    }
  } catch (err) {
    // cache does not exist or malformed
    if (err.code !== 'ENOENT') {
      output.debug(`Error reading latest package cache file: ${err}`);
    }
  }
}

/**
 * Fetches the dist tags from npm for a given package, using the registry
 * configured in `.npmrc` files or the `npm_config_registry` environment
 * variable so that environments with internal mirrors or firewalled
 * networks work correctly.
 *
 * @param {string} name The package name
 * @returns A map of dist tags to versions
 */
async function fetchDistTags(name) {
  const config = await loadNpmConfig();
  const registry = resolveRegistry(config);
  const url = `${registry}-/package/${name}/dist-tags`;
  output.debug(`Fetching ${url}`);

  const isHttps = url.startsWith('https://');
  const requestModule = isHttps ? https : http;
  const requestOptions = {
    headers: {
      accept:
        'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
    },
  };
  if (isHttps) {
    requestOptions.agent = new https.Agent({
      keepAlive: true,
      maxSockets: 15, // See: `npm config get maxsockets`
    });
  }

  return new Promise((resolve, reject) => {
    const req = requestModule.get(url, requestOptions, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(
                `Fetch dist-tags failed ${res.statusCode} ${res.statusMessage}`
              )
            );
          }

          resolve(JSON.parse(buf));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Loads and merges the npm-style configuration from `.npmrc` files following
 * npm's priority order:
 *
 *   1. Project `.npmrc` (current cwd, walking up but stopping before the
 *      user's home directory so we don't read `~/.npmrc` twice)
 *   2. User `.npmrc` (`$npm_config_userconfig` or `~/.npmrc`)
 *   3. Global `.npmrc` (`$npm_config_globalconfig`)
 *
 * Earlier entries win over later ones, matching npm's behavior.
 *
 * @param {string} [cwd] Override for the starting directory (defaults to
 *   `process.cwd()`). Mostly intended for unit tests.
 * @returns {Promise<Record<string, string>>}
 */
async function loadNpmConfig(cwd = process.cwd()) {
  const files = [];
  const home = os.homedir() || null;

  let dir = path.resolve(cwd);
  while (true) {
    if (home && samePath(dir, home)) {
      break;
    }
    files.push(path.join(dir, '.npmrc'));
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  const userConfig =
    process.env.npm_config_userconfig ||
    (home ? path.join(home, '.npmrc') : null);
  if (userConfig) {
    files.push(userConfig);
  }

  const globalConfig = process.env.npm_config_globalconfig;
  if (globalConfig) {
    files.push(globalConfig);
  }

  const merged = {};
  for (const file of files) {
    let content;
    try {
      content = await readFile(file, 'utf-8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        output.debug(`Failed to read ${file}: ${err.message}`);
      }
      continue;
    }

    output.debug(`Loaded npm config from ${file}`);
    const parsed = parseNpmrc(content);
    for (const key of Object.keys(parsed)) {
      if (!(key in merged)) {
        merged[key] = parsed[key];
      }
    }
  }

  return merged;
}

/**
 * Compares two filesystem paths for equality, accounting for case-insensitive
 * paths on Windows.
 */
function samePath(a, b) {
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

/**
 * Parses a minimal subset of the `.npmrc` format into a key/value map.
 * Comments (`#` and `;`), section headers (`[section]`) and surrounding
 * quotes are handled — that's enough for the `registry` entry we care about.
 *
 * @param {string} content
 */
function parseNpmrc(content) {
  const result = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith(';') ||
      line.startsWith('[')
    ) {
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }
  return result;
}

/**
 * Resolves the registry URL to use, in priority order:
 *   1. `npm_config_registry` / `NPM_CONFIG_REGISTRY` environment variable
 *   2. `registry=` from `.npmrc`
 *   3. The default `https://registry.npmjs.org/`
 *
 * @param {Record<string, string>} config
 */
function resolveRegistry(config) {
  const envRegistry =
    process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY;
  if (envRegistry) {
    output.debug(`Using registry from environment: ${envRegistry}`);
    return normalizeRegistry(envRegistry);
  }

  if (config.registry) {
    output.debug(`Using registry from .npmrc: ${config.registry}`);
    return normalizeRegistry(config.registry);
  }

  return DEFAULT_REGISTRY;
}

/**
 * Normalizes a registry URL by ensuring it has a trailing slash and a valid
 * `http(s):` protocol. Returns the npmjs.org default if the URL is not a
 * supported registry URL.
 *
 * @param {string} url
 */
function normalizeRegistry(url) {
  const trimmed = (url || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    output.debug(`Ignoring invalid registry URL: ${trimmed || '(empty)'}`);
    return DEFAULT_REGISTRY;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

module.exports = {
  parseNpmrc,
  resolveRegistry,
  normalizeRegistry,
  loadNpmConfig,
};

// The block below is the worker entry point and only runs when this file is
// executed directly (e.g. via `child_process.spawn`). When the file is loaded
// via `require()` from a unit test, none of the IPC/timer/exit side effects
// fire, keeping the helpers above safe to test in isolation.
if (require.main === module) {
  output = new WorkerOutput({
    // enable the debug logging if the `--debug` is set or if this worker
    // script was directly executed
    debug: process.argv.includes('--debug') || !process.connected,
  });

  process.on('unhandledRejection', err => {
    output.error('Exiting worker due to unhandled rejection:', err);
    process.exit(1);
  });

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
    await mkdir(cacheFileParsed.dir, { recursive: true });

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
      await writeFile(lockFile, String(process.pid), 'utf-8');

      const tags = await fetchDistTags(name);
      const version = tags[distTag];
      const expireAt = Date.now() + updateCheckInterval;
      const notifyAt = await getNotifyAt(cacheFile, version);

      if (version) {
        output.debug(`Found dist tag "${distTag}" with version "${version}"`);
      } else {
        output.error(`Dist tag "${distTag}" not found`);
        output.debug('Available dist tags:', Object.keys(tags));
      }

      output.debug(`Writing cache file: ${cacheFile}`);
      await writeFile(
        cacheFile,
        JSON.stringify({
          expireAt,
          notifyAt,
          version,
        })
      );
    } catch (err) {
      output.error(`Failed to get package info:`, err);
    } finally {
      clearTimeout(timer);

      if (await fileExists(lockFile)) {
        output.debug(`Releasing lock file: ${lockFile}`);
        await unlink(lockFile);
      }

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
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('No IPC bridge detected, exiting');
    process.exit(1);
  }
}
