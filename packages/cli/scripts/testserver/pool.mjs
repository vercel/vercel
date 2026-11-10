// The Testserver sandboxes a run uses: how many (one per 4 test files,
// counted with `vitest list`), which cached ones to reuse (pool-cache.mjs),
// and creating the rest in parallel with an OIDC token from the environment
// or minted for the logged-in user. Used by main.mjs.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import onExit from 'signal-exit';
import {
  createTestserver,
  getTrustedOidcToken,
  isAuthRejection,
  OIDC_PROJECT,
  OIDC_TEAM,
} from './create-testserver.mjs';
import {
  acquirePoolLock,
  adoptPendingSandboxes,
  checkCachedSandboxes,
  writePendingSandboxes,
  writePoolCache,
} from './pool-cache.mjs';
import { LOGIN_FIX, mintOidcToken } from './vercel-cli.mjs';

const LOCAL_TTL_MINUTES = 300;
const DEFAULT_MAX_SANDBOXES = 8;
// Concurrent test files per sandbox: the config runs WORKERS_PER_SANDBOX
// (test/testserver/sandbox-pool.ts) workers per sandbox, one file each.
const FILES_PER_SANDBOX = 4;
const CREATE_CONCURRENCY = 8;
const LIST_TIMEOUT_MS = 60_000;

// `fix` is the step for the diagnosed cause of a failed mint.
export const mintHint = (fix = LOGIN_FIX) =>
  [
    `The wrapper mints a token with \`vercel project token ${OIDC_PROJECT} --scope ${OIDC_TEAM}\`.`,
    fix,
  ].join('\n');

// TESTSERVER_BASE alone isn't enough: the runner sandbox needs the token too,
// unless the run is local.
const tokenHint = fix =>
  [
    mintHint(fix),
    'To run without a token, set TESTSERVER_RUNNER=local and point',
    'TESTSERVER_BASE at an existing sandbox, or set TESTSERVER_BASE to',
    "http://127.0.0.1:4000 for vercel/api's local `pnpm testserver`.",
  ].join('\n');

export const secs = ms => `${(ms / 1000).toFixed(1)}s`;

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// Keep extra args (test paths, filters) intact through `shell: true`.
export function quoteArg(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Count the test files `vitest run <args>` would run, with `vitest list` and
 * the same args, so filters and --shard apply. Files are the unit of
 * parallelism: tests in a file run one at a time. Undefined, after printing
 * why, if it can't tell.
 */
async function countTestFiles(command) {
  if (command[0] !== 'vitest' || command[1] !== 'run') {
    console.error(
      `✗ Could not count test files: the wrapper expects \`vitest run ...\`, got \`${command.join(' ')}\``
    );
    return undefined;
  }
  const dir = mkdtempSync(join(tmpdir(), 'testserver-list-'));
  const out = join(dir, 'tests.json');
  const listCommand = ['vitest', 'list', ...command.slice(2), `--json=${out}`];
  try {
    const { code, stderr, timedOut } = await new Promise(
      (resolvePromise, reject) => {
        // Own process group: dash's `sh -c` doesn't exec the command, so
        // killing only the shell would leave Vitest holding stderr open and
        // `close` would never fire.
        const child = spawn(listCommand.map(quoteArg).join(' '), {
          stdio: ['ignore', 'ignore', 'pipe'],
          shell: true,
          detached: true,
          // Listing doesn't run the CLI, so globalSetup skips the dist/
          // freshness check; the real run still enforces it.
          env: { ...process.env, TESTSERVER_LISTING: '1' },
        });
        let err = '';
        let expired = false;
        const timer = setTimeout(() => {
          expired = true;
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // Already gone.
          }
        }, LIST_TIMEOUT_MS);
        child.stderr.on('data', chunk => {
          err += chunk;
        });
        child.on('error', error => {
          clearTimeout(timer);
          reject(error);
        });
        // `close`, not `exit`: stderr may still be draining at `exit`.
        child.on('close', c => {
          clearTimeout(timer);
          resolvePromise({ code: c, stderr: err, timedOut: expired });
        });
      }
    );
    if (timedOut) {
      console.error(
        `✗ Could not count test files: \`vitest list\` did not finish in ${secs(LIST_TIMEOUT_MS)}`
      );
      return undefined;
    }
    if (code !== 0 || !existsSync(out)) {
      console.error(
        `✗ Could not count test files with \`vitest list\` (exit ${code}): ${stderr.trim().split('\n').pop() ?? ''}`
      );
      return undefined;
    }
    const list = JSON.parse(readFileSync(out, 'utf8'));
    if (!Array.isArray(list)) {
      console.error(
        '✗ Could not count test files: `vitest list` did not return a list'
      );
      return undefined;
    }
    return new Set(list.map(test => test.file)).size;
  } catch (err) {
    console.error(`✗ Could not count test files: ${err?.message ?? err}`);
    return undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * One sandbox per FILES_PER_SANDBOX test files, between 1 and `max`. Returns
 * the count and a reason for the log line.
 */
export function sandboxTarget(files, max) {
  const wanted = Math.max(1, Math.ceil(files / FILES_PER_SANDBOX));
  const per = `${files} test file${files === 1 ? '' : 's'}, ${FILES_PER_SANDBOX} per sandbox`;
  return wanted > max
    ? { count: max, reason: `${per}, capped at ${max}` }
    : { count: wanted, reason: per };
}

/**
 * The count when the test files can't be counted: the live cached sandboxes,
 * which cost nothing, or one new sandbox. Never more than `max`.
 */
export function fallbackTarget(cachedAlive, max) {
  const count = Math.min(max, Math.max(1, cachedAlive));
  return {
    count,
    reason:
      cachedAlive > 0
        ? 'test files not counted; using the live cached sandboxes'
        : 'test files not counted; one sandbox',
  };
}

/**
 * The exact sandbox count from TESTSERVER_SANDBOX_COUNT, or undefined when
 * it's unset and the count follows the test files. Throws on a bad value.
 */
export function exactSandboxCount(env) {
  const raw = env.TESTSERVER_SANDBOX_COUNT;
  if (raw === undefined || raw.trim() === '') return undefined;
  const count = positiveInt(raw.trim());
  if (count === undefined) {
    throw new Error(
      `TESTSERVER_SANDBOX_COUNT must be a positive integer, got "${raw}"`
    );
  }
  return count;
}

function maxSandboxes() {
  const setting = positiveInt(process.env.TESTSERVER_SANDBOXES);
  return setting ?? DEFAULT_MAX_SANDBOXES;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * Create `count` sandboxes, CREATE_CONCURRENCY at a time. `onCreated` runs as
 * each one succeeds, before the rest finish, so the caller can cache it right
 * away. A throwing `onCreated` is logged; the sandbox still counts as created.
 * `create` is `createTestserver`, replaceable in tests.
 */
export async function createSandboxes(
  count,
  { token, onCreated, create = createTestserver }
) {
  console.error(
    `Creating ${count} Testserver sandbox${count === 1 ? '' : 'es'} (TTL ${LOCAL_TTL_MINUTES} minutes; usually 10-20s${
      count > CREATE_CONCURRENCY ? `, ${CREATE_CONCURRENCY} at a time` : ''
    })...`
  );
  const width = String(count).length;
  const results = await mapLimit(
    Array.from({ length: count }, (_, i) => i),
    CREATE_CONCURRENCY,
    async i => {
      const label = `[testserver ${String(i + 1).padStart(width)}/${count}]`;
      const startedAt = Date.now();
      let config;
      try {
        config = await create({
          timeoutMinutes: LOCAL_TTL_MINUTES,
          build: process.env.TESTSERVER_BUILD || undefined,
          trustedOidcToken: token,
          logPrefix: count === 1 ? '[testserver]' : label,
          // Interleaved progress from parallel creations is unreadable.
          quiet: count > 1,
        });
      } catch (error) {
        console.error(
          `✗ ${count === 1 ? '' : `${label} `}Failed after ${secs(Date.now() - startedAt)}: ${error?.message ?? error}`
        );
        return { error };
      }
      console.error(
        `✓ ${count === 1 ? '' : `${label} `}Created ${config.testserver} in ${secs(Date.now() - startedAt)}`
      );
      try {
        onCreated(config);
      } catch (error) {
        console.error(
          `✗ ${count === 1 ? '' : `${label} `}Could not cache ${config.testserver}: ${error?.message ?? error}; using it for this run only`
        );
      }
      return { config };
    }
  );
  return {
    created: results.flatMap(r => (r.config ? [r.config] : [])),
    errors: results.flatMap(r => (r.error ? [r.error] : [])),
  };
}

let oidcTokenPromise;

/**
 * The OIDC token from the environment, else minted once per run. Resolves to
 * `{ token, source }` or `{ error, fix, source }`; never rejects.
 */
export function getOidcToken() {
  oidcTokenPromise ??= (async () => {
    const fromEnv = getTrustedOidcToken();
    if (fromEnv) return { token: fromEnv, source: 'environment' };
    const minted = await mintOidcToken();
    if (!minted.token) return { ...minted, source: 'minted' };
    console.error(
      `✓ Minted an OIDC token for ${OIDC_TEAM}/${OIDC_PROJECT} (valid 12h)`
    );
    return { token: minted.token, source: 'minted' };
  })();
  return oidcTokenPromise;
}

/**
 * The Testserver sandboxes for `command`'s run, from the pool in `pool`
 * (poolPaths() in pool-cache.mjs) plus new ones. Returns
 * `{ sandboxes, reused, created }` with at least one sandbox, or exits 1.
 * Holds the pool lock until the process exits or is signalled, and first adopts what runs
 * without the lock left in pending files. When another run holds the lock,
 * this run creates its own sandboxes without reading or writing the cache,
 * and records each one in its pending file as it is created; the next run
 * that holds the lock adds them to the pool.
 */
export async function resolveSandboxes(command, exactCount, pool) {
  const lock = acquirePoolLock(pool.lock);
  const pooled = Boolean(lock.release);
  if (pooled) {
    // Released on exit, and on a signal that would end the process without
    // an 'exit' event. signal-exit re-raises the signal only when no other
    // handler owns it, as runInSandbox() in main.mjs does while it stops the
    // runner; that handler's process.exit() then releases. It must stay on
    // the major version execa uses (3): signal-exit 3 instances share one
    // count of their handlers, so they don't each wait for the other.
    onExit(lock.release);
    const adopted = adoptPendingSandboxes(pool.cache, pool.pending, {
      maxAgeMs: LOCAL_TTL_MINUTES * 60_000,
    });
    if (adopted > 0) {
      console.error(
        `[testserver] Added ${adopted} sandbox${adopted === 1 ? '' : 'es'} that other runs created to the pool.`
      );
    }
  } else {
    console.error(
      `[testserver] Another Testserver run${lock.heldBy ? ` (pid ${lock.heldBy})` : ''} holds the sandbox pool; creating uncached sandboxes for this run, which the next run to get the pool adds to it. Lock: ${pool.lock}`
    );
  }
  const saveCache = pooled
    ? list => writePoolCache(list, pool.cache)
    : list => writePendingSandboxes(list, pool.pending);

  const [files, { usable, retained, checkMs }] = await Promise.all([
    exactCount === undefined ? countTestFiles(command) : undefined,
    pooled
      ? checkCachedSandboxes(pool.cache)
      : { usable: [], retained: [], checkMs: 0 },
  ]);
  const max = maxSandboxes();
  const { count, reason } =
    exactCount !== undefined
      ? { count: exactCount, reason: 'TESTSERVER_SANDBOX_COUNT' }
      : files === undefined
        ? fallbackTarget(usable.length, max)
        : sandboxTarget(files, max);
  console.error(
    `[testserver] ${count} sandbox${count === 1 ? '' : 'es'} (${reason}); ${usable.length} cached and alive${
      usable.length > 0 ? ` (health check ${secs(checkMs)})` : ''
    }`
  );

  const reused = usable.slice(0, count);
  const missing = count - reused.length;
  if (missing === 0) {
    saveCache([...usable, ...retained]);
    return { sandboxes: reused, reused: reused.length, created: 0 };
  }

  const {
    token,
    error: tokenError,
    fix: tokenFix,
    source: tokenSource,
  } = await getOidcToken();
  if (!token) {
    if (reused.length > 0) {
      console.error(
        `Could not mint an OIDC token to create ${missing} more (${tokenError}); running on ${reused.length} cached sandbox${reused.length === 1 ? '' : 'es'}.`
      );
      saveCache([...usable, ...retained]);
      return { sandboxes: reused, reused: reused.length, created: 0 };
    }
    console.error(
      [
        `Could not mint an OIDC token: ${tokenError}`,
        '',
        tokenHint(tokenFix),
      ].join('\n')
    );
    process.exit(1);
  }

  // Unused and retained cached sandboxes stay cached for later runs. Each new
  // sandbox is cached as soon as it exists: if the run is interrupted while
  // others are still being created, the next run can reuse it.
  const cached = [...usable, ...retained];
  saveCache(cached);
  const { created, errors } = await createSandboxes(missing, {
    token,
    onCreated: config => {
      cached.push(config);
      saveCache(cached);
    },
  });

  const authError = errors.find(e => isAuthRejection(e?.status));
  if (authError) {
    console.error(
      tokenSource === 'environment'
        ? `Testserver rejected the OIDC token from VERCEL_TRUSTED_OIDC_IDP_TOKEN or VERCEL_OIDC_TOKEN (HTTP ${authError.status}); it has probably expired. Unset it to let the wrapper mint one.\n\n${tokenHint()}`
        : `Testserver rejected the minted OIDC token (HTTP ${authError.status}).\n\n${tokenHint()}`
    );
    process.exit(1);
  }
  const sandboxes = [...reused, ...created];
  if (sandboxes.length === 0) {
    console.error('Failed to create any Testserver sandbox.');
    process.exit(1);
  }
  if (errors.length > 0) {
    console.error(
      `Continuing with ${sandboxes.length} of ${count} sandboxes; ${errors.length} failed to create.`
    );
  }
  return { sandboxes, reused: reused.length, created: created.length };
}
