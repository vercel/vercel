#!/usr/bin/env node
// Wait until exact package versions are installable from npm.
//
// Why this exists:
//   Release publishes @vercel/vc-native-* and native acceptance installs them
//   directly right afterwards. npm packuments can lag a successful
//   `npm publish` by minutes, which would fail the install for the wrong
//   reason. Poll until every requested `name@version` resolves.
//
// Usage:
//   node utils/wait-for-npm-packages.mjs --package <name@version> \
//     [--package <name@version> ...] [--timeout-ms <ms>] [--interval-ms <ms>]

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * @param {string[]} specs
 * @param {object} [options]
 * @param {(spec: string) => Promise<boolean>} [options.isPublished]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.intervalMs]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {() => number} [options.now]
 * @param {(message: string) => void} [options.log]
 */
export async function waitForPackages(
  specs,
  {
    isPublished = isPublishedOnNpm,
    timeoutMs = 15 * 60 * 1000,
    intervalMs = 15_000,
    sleep = ms => new Promise(done => setTimeout(done, ms)),
    now = Date.now,
    log = console.log,
  } = {}
) {
  if (specs.length === 0) {
    throw new Error('No packages to wait for.');
  }
  const deadline = now() + timeoutMs;
  let pending = [...specs];

  for (;;) {
    const results = await Promise.all(
      pending.map(async spec => [spec, await isPublished(spec)])
    );
    pending = results.filter(([, published]) => !published).map(([s]) => s);

    if (pending.length === 0) {
      log(`Available on npm: ${specs.join(', ')}`);
      return;
    }
    if (now() >= deadline) {
      throw new Error(
        `Timed out waiting for npm to serve: ${pending.join(', ')}`
      );
    }
    log(`Waiting for npm to serve: ${pending.join(', ')}`);
    await sleep(intervalMs);
  }
}

async function isPublishedOnNpm(spec) {
  try {
    await execFileAsync('npm', ['view', spec, 'version'], {
      // npm is a .cmd shim on Windows runners.
      shell: process.platform === 'win32',
    });
    return true;
  } catch {
    return false;
  }
}

function getArgValues(name) {
  const values = [];
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1] !== undefined) {
      values.push(process.argv[++i]);
    }
  }
  return values;
}

async function main() {
  const [timeoutMs] = getArgValues('--timeout-ms');
  const [intervalMs] = getArgValues('--interval-ms');
  await waitForPackages(getArgValues('--package'), {
    ...(timeoutMs ? { timeoutMs: Number(timeoutMs) } : {}),
    ...(intervalMs ? { intervalMs: Number(intervalMs) } : {}),
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(err => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
