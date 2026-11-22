// Run the Testserver lane's Vitest command in a Vercel Sandbox (the "runner")
// instead of on this machine. Used by main.mjs, through runVitestInRunner().
//
// Each run:
//   1. finds or builds the build mode's snapshot, cached per machine and per
//      runner team and project in
//      ${XDG_CACHE_HOME:-~/.cache}/vercel-cli-testserver/runner-snapshots.json;
//   2. starts a fresh runner from it in iad1, next to the Testserver sandboxes;
//   3. has the mode upload what its factory assembled, or started assembling,
//      on this machine before any sandbox started, and ready the CLI's dist/
//      in the runner;
//   4. runs Vitest there, streaming its output here;
//   5. downloads failure artifacts into the local .results folder;
//   6. stops every sandbox it created.
//
// What goes into the snapshot and the upload belongs to a build mode
// (modes/*.mjs), which this file knows only through the BuildMode contract
// below; main.mjs picks the mode. What the modes share about the sandboxes is
// in remote.mjs. The pure helpers are exported for unit tests. The SDK is
// imported lazily so local runs and tests never load it.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { RunnerError } from './files.mjs';
import {
  lineSplitter,
  megabytes,
  outputRule,
  REMOTE_ROOT,
  rewriteRemotePaths,
  RUNNER_REGION,
  RUNNER_RUNTIME,
  runStep,
  secs,
  stagingPath,
} from './remote.mjs';
import { LOCAL_HINT } from './runner-config.mjs';

export { RunnerError };

/**
 * A build mode: what goes into the runner's snapshot and what each run
 * uploads on top so the CLI's dist/ is ready for Vitest. One per file in
 * modes/; this file never imports them. Each comes from a factory that main.mjs
 * runs before any sandbox starts: it refuses what the mode can't carry and
 * assembles the run's upload, or starts assembling it, so `apply()` only
 * uploads and builds.
 *
 * @typedef {{
 *   summary: string;
 *   startedNote: string;
 *   vcpus: (sandboxCount: number) => number;
 *   ready: Promise<void>;
 *   snapshot: SnapshotRecipe;
 *   apply: (
 *     sandbox: any,
 *     ctx: { phases: string[]; log: (line: string) => void; signal: AbortSignal }
 *   ) => Promise<void>;
 * }} BuildMode
 *
 * - `summary`: shown as "[runner] Running Vitest remotely in a runner sandbox
 *   (...), <summary>; ...".
 * - `startedNote`: appended to "✓ [runner] Started <name> from snapshot <id>"
 *   (may be '').
 * - `vcpus(sandboxCount)`: the runner's size for a run against that many
 *   Testserver sandboxes.
 * - `ready`: settles when the upload the factory started assembling is ready,
 *   and rejects when that fails. The runner waits for it alongside the
 *   runner's start, so a failure stops the sandboxes starting. The mode
 *   handles its rejection, which can come before the runner waits for it.
 * - `snapshot`: the snapshot recipe ensureSnapshot() builds on a miss.
 * - `apply(sandbox, ctx)`: uploads the run's files and makes dist/ ready for
 *   Vitest. Pushes phase strings onto `ctx.phases`.
 *
 * @typedef {{
 *   key: string;
 *   vcpus: number;
 *   missMessage: string;
 *   builtFor: string;
 *   entry: object;
 *   begin: (ctx: { log: (line: string) => void; prefix: string }) =>
 *     (sandbox: any, step: (label: string, script: string) => Promise<void>) => Promise<void>;
 * }} SnapshotRecipe
 *
 * - `key`: what the snapshot is built from (sha256 hex). snapshotCacheKey()
 *   adds where the snapshot lives and who owns it.
 * - `vcpus`: the build sandbox's size.
 * - `missMessage`: logged with the "[runner snapshot]" prefix on a miss.
 * - `builtFor`: shown as "✓ Built runner snapshot <id> for <builtFor> in ...".
 * - `entry`: extra fields stored in the snapshot's cache entry.
 * - `begin(ctx)`: starts laptop-side prep (packing) at once and returns the
 *   recipe to run in the build sandbox. Its `step(label, script)` streams a
 *   bash script with the "[runner snapshot]" prefix and throws RunnerError
 *   with the output tail when it fails.
 */

// ---------------------------------------------------------------------------
// Constants

const SNAPSHOT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
// Rebuild a cached snapshot this close to expiring rather than risk it
// expiring between the lookup and the runner start.
const SNAPSHOT_MIN_REMAINING_MS = 60 * 60 * 1000;
const SNAPSHOT_BUILD_TIMEOUT_MS = 30 * 60 * 1000;
// How long closing waits for a Sandbox.create in flight, so the sandbox it
// returns can be stopped instead of outliving the wrapper until its timeout.
const CREATE_SETTLE_MS = 20_000;
// How long closing waits for a build sandbox's snapshot() in flight: stopping
// the sandbox mid-snapshot throws away a build of a few minutes.
const SNAPSHOT_SETTLE_MS = 2 * 60 * 1000;
// How long closing allows for stopping and deleting the sandboxes after those
// waits.
const STOP_SANDBOXES_MS = 30_000;
/**
 * How long closing a run's sandboxes may take: the longest wait for work in
 * flight, then the stops. main.mjs gives a signalled run this long to stop
 * before giving up, so the waits above can finish.
 */
export const CLOSE_TIMEOUT_MS =
  Math.max(CREATE_SETTLE_MS, SNAPSHOT_SETTLE_MS) + STOP_SANDBOXES_MS;

// ---------------------------------------------------------------------------
// Pure helpers

/**
 * The snapshot cache key: sha256 over the recipe's `recipeKey`, the region and
 * runtime the build sandbox runs in, and the team and project that own the
 * snapshot.
 */
export function snapshotCacheKey(recipeKey, { teamId, projectId }) {
  return createHash('sha256')
    .update(
      `region=${RUNNER_REGION}\0runtime=${RUNNER_RUNTIME}\0team=${teamId}\0project=${projectId}\0recipe=${recipeKey}`
    )
    .digest('hex');
}

/** Whether a snapshot cache entry can still be used at `now` (ms). */
export function snapshotEntryUsable(entry, now) {
  if (typeof entry?.snapshotId !== 'string') return false;
  if (entry.expiresAt === null || entry.expiresAt === undefined) return true;
  const expires = Date.parse(entry.expiresAt);
  return !Number.isNaN(expires) && expires - now > SNAPSHOT_MIN_REMAINING_MS;
}

/** A one-paragraph explanation of a runner failure for the log. */
export function describeRunnerError(err) {
  const message = err?.message ?? String(err);
  const status = err?.response?.status;
  if (typeof status !== 'number') return message;
  const hint =
    status === 401 || status === 403
      ? ' The runner credentials were rejected: the vercel/vercel OIDC token, or TESTSERVER_RUNNER_TOKEN, _TEAM_ID and _PROJECT_ID when set.'
      : status === 402 || status === 429
        ? ' The project may be out of Sandbox quota or rate-limited.'
        : '';
  return `Vercel Sandbox API error (HTTP ${status}): ${message.replace(/\.?$/, '.')}${hint}`;
}

// ---------------------------------------------------------------------------
// Effects

let sdkPromise;
function loadSdk() {
  sdkPromise ??= import('@vercel/sandbox');
  return sdkPromise;
}

export function snapshotCachePath(env = process.env) {
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'vercel-cli-testserver', 'runner-snapshots.json');
}

function readSnapshotCache(path) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function updateSnapshotCache(path, key, entry) {
  // Re-read right before writing so concurrent worktrees lose as little as
  // possible; last write wins on the same key.
  const cache = readSnapshotCache(path);
  if (entry) cache[key] = entry;
  else delete cache[key];
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(cache, null, 2)}\n`);
  renameSync(tmpPath, path);
}

function extractTarball(file, cwd) {
  return new Promise((resolvePromise, reject) => {
    // Feed the archive on stdin and extract into the child's cwd, so tar sees
    // no paths at all. GNU tar (Git for Windows) reads `C:\...` archive paths
    // as `host:path`. `-m` and `--no-same-owner` skip restoring mtimes and
    // owners, which can fail on Windows and don't matter for artifacts.
    const child = spawn('tar', ['--no-same-owner', '-xzmf', '-'], {
      cwd,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    let readError;
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    // tar may stop at the end-of-archive marker without draining stdin (EPIPE);
    // its exit code is what counts.
    child.stdin.on('error', () => {});
    const input = createReadStream(file);
    input.on('error', err => {
      readError = err;
      child.stdin.destroy();
    });
    input.pipe(child.stdin);
    child.on('error', reject);
    child.on('close', code => {
      if (readError) {
        reject(new RunnerError(`Could not read ${file}: ${readError.message}`));
      } else if (code !== 0) {
        reject(new RunnerError(`tar failed (exit ${code}): ${stderr.trim()}`));
      } else {
        resolvePromise();
      }
    });
  });
}

function runnerTags() {
  let user = 'unknown';
  try {
    user = userInfo().username;
  } catch {
    // Some environments have no passwd entry.
  }
  return { purpose: 'vercel-cli-testserver-runner', user };
}

/** Wait for `promises` to settle, or `ms`, whichever comes first. */
async function settleWithin(promises, ms) {
  let timer;
  await Promise.race([
    Promise.allSettled(promises),
    new Promise(resolvePromise => {
      timer = setTimeout(resolvePromise, ms);
    }),
  ]);
  clearTimeout(timer);
}

/** Track `task` in `set` until it settles; its rejection stays the caller's. */
function trackIn(set, task) {
  set.add(task);
  task
    .finally(() => set.delete(task))
    .catch(() => {
      // The caller handles the rejection.
    });
  return task;
}

/**
 * Owns every sandbox one run creates. `close()` stops them all, waiting
 * briefly for creates and snapshots in flight; a create that resolves after
 * closing started is stopped at once. `close()` is memoized.
 */
function sandboxScope(log) {
  const live = new Set();
  const creating = new Set();
  const snapshotting = new Set();
  let closing;
  const closedError = () =>
    new RunnerError('The runner is shutting down; not starting a sandbox');
  return {
    get closed() {
      return closing !== undefined;
    },
    create(sdk, params) {
      if (closing) return Promise.reject(closedError());
      return trackIn(
        creating,
        (async () => {
          const sandbox = await sdk.Sandbox.create(params);
          if (closing) {
            await stopRunner(sandbox, log);
            throw closedError();
          }
          live.add(sandbox);
          return sandbox;
        })()
      );
    },
    /**
     * `sandbox.snapshot(params)`, which stops the sandbox, then deletes it.
     * Closing waits for it rather than stopping the sandbox mid-snapshot.
     */
    snapshot(sandbox, params) {
      return trackIn(
        snapshotting,
        (async () => {
          const snapshot = await sandbox.snapshot(params);
          live.delete(sandbox);
          await deleteQuietly(sandbox);
          return snapshot;
        })()
      );
    },
    close() {
      closing ??= (async () => {
        if (snapshotting.size > 0) {
          log(
            `[runner snapshot] Letting the snapshot in flight finish, up to ${Math.round(SNAPSHOT_SETTLE_MS / 60_000)} minutes, so later runs can use it...`
          );
        }
        await Promise.all([
          settleWithin([...creating], CREATE_SETTLE_MS),
          settleWithin([...snapshotting], SNAPSHOT_SETTLE_MS),
        ]);
        await Promise.all([...live].map(sandbox => stopRunner(sandbox, log)));
        live.clear();
      })();
      return closing;
    },
  };
}

/**
 * Snapshot id for `recipe`: a cached one, or a new build. Returns
 * `{ snapshotId, key, built, ms }`. A failed build sandbox is left to the
 * scope to stop, and saves no snapshot.
 */
async function ensureSnapshot({
  sdk,
  scope,
  creds,
  recipe,
  log,
  cachePath,
  forceRebuild,
  signal,
}) {
  const startedAt = Date.now();
  const key = snapshotCacheKey(recipe.key, creds);
  const cached = readSnapshotCache(cachePath)[key];
  if (!forceRebuild && snapshotEntryUsable(cached, Date.now())) {
    return {
      snapshotId: cached.snapshotId,
      key,
      built: false,
      ms: Date.now() - startedAt,
    };
  }

  const prefix = '[runner snapshot]';
  log(`${prefix} ${recipe.missMessage}`);
  const runRecipe = recipe.begin({ log, prefix });
  const sandbox = await scope.create(sdk, {
    region: RUNNER_REGION,
    runtime: RUNNER_RUNTIME,
    resources: { vcpus: recipe.vcpus },
    timeout: SNAPSHOT_BUILD_TIMEOUT_MS,
    persistent: false,
    tags: { ...runnerTags(), role: 'snapshot-build' },
    ...creds,
  });
  log(`${prefix} Started build sandbox ${sandbox.name}`);
  const where = 'the snapshot sandbox';
  const step = async (label, stepScript) => {
    const ms = await runStep(sandbox, {
      label,
      where,
      script: stepScript,
      prefix,
      log,
      signal,
    });
    log(`${prefix} ✓ ${label} in ${secs(ms)}`);
  };
  log(
    `${prefix} ${outputRule(`output from build sandbox ${sandbox.name} (${RUNNER_REGION})`)}`
  );
  let outcome = 'failed';
  try {
    await runRecipe(sandbox, step);
    outcome = 'recipe finished';
  } finally {
    if (!signal.aborted) {
      log(`${prefix} ${outputRule(`end of build sandbox output: ${outcome}`)}`);
    }
  }
  log(`${prefix} Saving the build sandbox as a snapshot...`);
  const snapshot = await scope.snapshot(sandbox, {
    expiration: SNAPSHOT_EXPIRATION_MS,
  });
  if (snapshot.status === 'failed') {
    throw new RunnerError(`Snapshot ${snapshot.snapshotId} failed`, {
      hint: LOCAL_HINT,
    });
  }
  const expiresAt =
    snapshot.expiresAt?.toISOString() ??
    new Date(Date.now() + SNAPSHOT_EXPIRATION_MS).toISOString();
  updateSnapshotCache(cachePath, key, {
    snapshotId: snapshot.snapshotId,
    createdAt: new Date().toISOString(),
    expiresAt,
    ...recipe.entry,
  });
  const ms = Date.now() - startedAt;
  log(
    `✓ Built runner snapshot ${snapshot.snapshotId} for ${recipe.builtFor} in ${secs(ms)} (${megabytes(snapshot.sizeBytes ?? 0)})`
  );
  return { snapshotId: snapshot.snapshotId, key, built: true, ms };
}

/** Drop a cache entry, e.g. for a snapshot that no longer exists. */
function forgetSnapshot(key, cachePath) {
  updateSnapshotCache(cachePath, key, undefined);
}

/** True when `snapshotId` can no longer start a sandbox. */
async function snapshotGone(sdk, creds, snapshotId) {
  try {
    const snapshot = await sdk.Snapshot.get({ snapshotId, ...creds });
    return snapshot.status !== 'created';
  } catch (err) {
    const status = err?.response?.status;
    return status === 404 || status === 410;
  }
}

class SnapshotGoneError extends Error {
  constructor(snapshotId, cause) {
    super(`Snapshot ${snapshotId} no longer exists`, { cause });
    this.name = 'SnapshotGoneError';
  }
}

/**
 * Start a runner from `snapshotId`. Throws a `SnapshotGoneError` when the
 * snapshot no longer exists, so the caller can rebuild it.
 */
async function startRunner({
  sdk,
  scope,
  creds,
  snapshotId,
  vcpus,
  timeoutMs,
}) {
  try {
    return await scope.create(sdk, {
      source: { type: 'snapshot', snapshotId },
      region: RUNNER_REGION,
      resources: { vcpus },
      timeout: timeoutMs,
      persistent: false,
      tags: { ...runnerTags(), role: 'runner' },
      ...creds,
    });
  } catch (err) {
    if (!scope.closed && (await snapshotGone(sdk, creds, snapshotId))) {
      throw new SnapshotGoneError(snapshotId, err);
    }
    throw err;
  }
}

/**
 * Find or build `recipe`'s snapshot and start a runner from it, rebuilding once
 * when the cached snapshot is gone. Returns `{ sandbox, snapshot, startMs }`.
 */
async function startRunnerFromSnapshot({
  sdk,
  scope,
  creds,
  recipe,
  log,
  cachePath,
  vcpus,
  timeoutMs,
  signal,
}) {
  const snapshotFor = forceRebuild =>
    ensureSnapshot({
      sdk,
      scope,
      creds,
      recipe,
      log,
      cachePath,
      forceRebuild,
      signal,
    });
  let snapshot = await snapshotFor(false);
  for (let rebuilt = false; ; rebuilt = true) {
    const startedAt = Date.now();
    try {
      const sandbox = await startRunner({
        sdk,
        scope,
        creds,
        snapshotId: snapshot.snapshotId,
        vcpus,
        timeoutMs,
      });
      return { sandbox, snapshot, startMs: Date.now() - startedAt };
    } catch (err) {
      if (rebuilt || !(err instanceof SnapshotGoneError)) throw err;
      log(`✗ [runner] ${err.message}; rebuilding it`);
      forgetSnapshot(snapshot.key, cachePath);
      snapshot = await snapshotFor(true);
    }
  }
}

/**
 * Run Vitest in the runner with `args` (everything after `vitest`), streaming
 * its output with runner paths rewritten to `localRoot`. Aborting `signal`
 * kills the command. Returns the exit code.
 */
async function runRemote(sandbox, { args, env, localRoot, log, signal }) {
  const cliDir = `${REMOTE_ROOT}/packages/cli`;
  const command = await sandbox.runCommand({
    cmd: `${cliDir}/node_modules/.bin/vitest`,
    args,
    cwd: cliDir,
    env,
    detached: true,
  });
  const kill = () => {
    command.kill('SIGTERM').catch(() => {});
  };
  // An abort while runCommand was in flight still kills the command.
  if (signal.aborted) kill();
  else signal.addEventListener('abort', kill, { once: true });
  try {
    log(
      `[runner] ${outputRule(`Vitest output from runner ${sandbox.name} (${RUNNER_REGION}); paths point at this checkout`)}`
    );
    const outputs = { stdout: process.stdout, stderr: process.stderr };
    const splitters = { stdout: lineSplitter(), stderr: lineSplitter() };
    const write = (stream, text) => {
      if (text) {
        outputs[stream].write(rewriteRemotePaths(text, REMOTE_ROOT, localRoot));
      }
    };
    for await (const { stream, data } of command.logs({ signal })) {
      write(stream, splitters[stream].push(data));
    }
    write('stdout', splitters.stdout.flush());
    write('stderr', splitters.stderr.flush());
    const { exitCode } = await command.wait({ signal });
    return exitCode ?? 1;
  } finally {
    signal.removeEventListener('abort', kill);
  }
}

/**
 * Copy the runner's failure artifacts into the local results folder, merging
 * with what's there. Returns `{ downloaded, ms }`.
 */
async function downloadResults(sandbox, repoRoot) {
  const startedAt = Date.now();
  const testserverDir = 'packages/cli/test/testserver';
  const remoteTar = await stagingPath(sandbox, 'results.tgz');
  const pack = await sandbox.runCommand({
    cmd: 'sh',
    args: [
      '-c',
      `cd ${REMOTE_ROOT}/${testserverDir} && [ -d .results ] && tar -czf ${remoteTar} .results`,
    ],
  });
  if (pack.exitCode !== 0) {
    return { downloaded: false, ms: Date.now() - startedAt };
  }
  const dir = mkdtempSync(join(tmpdir(), 'testserver-results-'));
  try {
    const local = join(dir, 'results.tgz');
    const written = await sandbox.downloadFile(
      { path: remoteTar },
      { path: local },
      { mkdirRecursive: true }
    );
    if (!written) {
      throw new RunnerError('Could not download the failure artifacts');
    }
    const target = join(repoRoot, testserverDir);
    mkdirSync(target, { recursive: true });
    await extractTarball(local, target);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { downloaded: true, ms: Date.now() - startedAt };
}

/**
 * Stop the sandbox, then delete it so stopped runners don't pile up in the
 * project. Logs instead of throwing.
 */
async function stopRunner(sandbox, log) {
  try {
    await sandbox.stop();
  } catch (err) {
    log(
      `✗ [runner] Could not stop ${sandbox.name}: ${err?.message ?? err}; its ${Math.round((sandbox.timeout ?? 0) / 60_000)}-minute timeout stops it`
    );
    return;
  }
  await deleteQuietly(sandbox);
}

async function deleteQuietly(sandbox) {
  try {
    // Keeps the snapshots it was created from or produced.
    await sandbox.delete({ deleteOrphanSnapshots: false });
  } catch {
    // A stopped sandbox costs nothing; the project's list just keeps it.
  }
}

/**
 * Run `vitest <vitestArgs>` in a fresh runner sandbox, with the CLI made
 * ready by `mode` (a BuildMode, see above). Never throws.
 * Every sandbox it creates is stopped before it returns.
 * → { outcome: 'completed', exitCode, phases }
 *   | { outcome: 'failed', error, phases }
 *   | { outcome: 'aborted' }
 * `sdk` (`{ Sandbox, Snapshot }`) defaults to `@vercel/sandbox`.
 */
export async function runVitestInRunner({
  vitestArgs,
  bases,
  creds,
  isAgent,
  timeoutMs,
  repoRoot,
  log,
  mode,
  signal = new AbortController().signal,
  sdk,
  snapshotCachePath: cachePath = snapshotCachePath(),
}) {
  const scope = sandboxScope(log);
  const onAbort = () => void scope.close();
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) {
    signal.removeEventListener('abort', onAbort);
    return { outcome: 'aborted' };
  }
  const phases = [];
  try {
    sdk ??= await loadSdk();
    const vcpus = mode.vcpus(bases.length);
    log(
      `[runner] Running Vitest remotely in a runner sandbox (${RUNNER_REGION}, ${RUNNER_RUNTIME}, ${vcpus} vCPUs, ${Math.round(timeoutMs / 60_000)}-minute timeout), ${mode.summary}; TESTSERVER_RUNNER=local runs it here`
    );

    const started = (async () => {
      const { sandbox, snapshot, startMs } = await startRunnerFromSnapshot({
        sdk,
        scope,
        creds,
        recipe: mode.snapshot,
        log,
        cachePath,
        vcpus,
        timeoutMs,
        signal,
      });
      phases.push(
        `snapshot ${snapshot.built ? 'built' : 'hit'} ${secs(snapshot.ms)}`,
        `start ${secs(startMs)}`
      );
      log(
        `✓ [runner] Started ${sandbox.name} from snapshot ${snapshot.snapshotId}${mode.startedNote} in ${secs(startMs)}`
      );
      return sandbox;
    })();
    started.catch(() => {});
    // A failed upload stops the start: closing the scope stops its sandboxes.
    const [sandbox] = await Promise.all([started, mode.ready]);
    signal.throwIfAborted();

    await mode.apply(sandbox, { phases, log, signal });
    signal.throwIfAborted();

    const testsStartedAt = Date.now();
    const exitCode = await runRemote(sandbox, {
      // Absolute local paths in the arguments point at the same files there.
      args: vitestArgs.map(arg =>
        rewriteRemotePaths(arg, repoRoot, REMOTE_ROOT)
      ),
      env: {
        TESTSERVER_BASES: bases.join(','),
        TESTSERVER_IS_AGENT: isAgent ? '1' : '0',
        NO_UPDATE_NOTIFIER: '1',
        // The runner has no TTY; color only when this terminal would.
        ...(process.stdout.isTTY && !process.env.NO_COLOR
          ? { FORCE_COLOR: '1' }
          : { NO_COLOR: '1' }),
      },
      localRoot: repoRoot,
      log,
      signal,
    });
    phases.push(`tests ${secs(Date.now() - testsStartedAt)}`);
    signal.throwIfAborted();
    log(
      `[runner] ${outputRule(`end of runner output: Vitest exited ${exitCode}`)}`
    );

    // Missing artifacts don't change what Vitest reported.
    try {
      const results = await downloadResults(sandbox, repoRoot);
      phases.push(`results ${secs(results.ms)}`);
      if (results.downloaded) {
        log(
          `[runner] Downloaded failure artifacts to ${join(repoRoot, 'packages/cli/test/testserver/.results')}`
        );
      }
    } catch (err) {
      signal.throwIfAborted();
      log(
        `✗ [runner] Could not download failure artifacts: ${describeRunnerError(err)}`
      );
      phases.push('results failed');
    }
    signal.throwIfAborted();
    return { outcome: 'completed', exitCode, phases };
  } catch (error) {
    if (signal.aborted) return { outcome: 'aborted' };
    return { outcome: 'failed', error, phases };
  } finally {
    await scope.close();
    signal.removeEventListener('abort', onAbort);
  }
}
