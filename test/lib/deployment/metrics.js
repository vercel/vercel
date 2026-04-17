const nodeFetch = require('node-fetch');

const DATADOG_API_KEY = process.env.DATADOG_API_KEY;
const DATADOG_ENDPOINT = 'https://api.datadoghq.com/api/v2/series';

const pendingPoints = [];
let flushScheduled = false;
let flushRegistered = false;

function getCommonTags() {
  const tags = [];

  const pkg = process.env.npm_package_name;
  if (pkg) tags.push(`package:${pkg}`);

  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) tags.push(`repo:${repo}`);

  const runnerOs = process.env.RUNNER_OS;
  const runnerArch = process.env.RUNNER_ARCH;
  if (runnerOs) tags.push(`runner:${runnerOs}-${runnerArch || 'unknown'}`);

  const cliVersion = process.env.VERCEL_CLI_VERSION;
  if (cliVersion) tags.push(`cli_version:${cliVersion}`);

  return tags;
}

/**
 * Report a transient error occurrence to Datadog.
 * Catches all errors to avoid impacting test execution.
 *
 * @param {{ location: string }} options
 */
function reportTransientError({ location }) {
  if (!DATADOG_API_KEY) return;

  pendingPoints.push({
    timestamp: Math.floor(Date.now() / 1000),
    tags: [...getCommonTags(), `location:${location}`],
  });

  scheduleFlush();
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;

  // Flush on next tick to batch points from the same event loop turn
  Promise.resolve().then(() => {
    flushScheduled = false;
    flush();
  });

  // Also ensure we flush before the process exits
  if (!flushRegistered) {
    flushRegistered = true;
    process.on('beforeExit', () => flush());
  }
}

function flush() {
  if (pendingPoints.length === 0) return;

  const points = pendingPoints.splice(0, pendingPoints.length);

  const series = points.map(point => ({
    metric: 'ci.test.transient_error.count',
    type: 1, // count
    points: [{ timestamp: point.timestamp, value: 1 }],
    tags: point.tags,
  }));

  const body = JSON.stringify({ series });

  nodeFetch(DATADOG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': DATADOG_API_KEY,
    },
    body,
    timeout: 5000,
  }).catch(err => {
    console.error(`[metrics] Failed to send Datadog metrics: ${err.message}`);
  });
}

module.exports = { reportTransientError };
