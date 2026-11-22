// Wrap a test command with a pool of Testserver sandboxes.
//
// Port of vercel/front tooling/scripts/start-testserver-sandbox.ts (at 185cfac41a9),
// extended from one sandbox to a pool.
//
// Usage: node scripts/testserver/main.mjs -- <command...>
//
// The sandboxes reach the command as a comma-separated TESTSERVER_BASES, and
// the Vitest config runs 4 workers per sandbox. They are resolved in this order:
//   1. TESTSERVER_BASES or TESTSERVER_BASE already set: use them.
//   2. CI set: no setup; the CI job provides TESTSERVER_BASE(S).
//   3. One sandbox per 4 test files (counted with `vitest list`), at most
//      TESTSERVER_SANDBOXES (default 8). If it can't count them, it uses the
//      live cached sandboxes, or one new sandbox. TESTSERVER_SANDBOX_COUNT=<n>
//      asks for exactly n instead and skips the count.
//      The pool lives in <repo root>/node_modules/.cache/testserver/.
//      Cached sandboxes in its sandboxes.json that still respond and have at
//      least 30 minutes left are reused. One that fails its health check but
//      has 30 minutes left stays cached for later runs without being used in
//      this one. The rest are created in parallel with a 300-minute TTL and
//      added to the cache. A lock file next to the cache keeps a second run
//      in the same checkout off the pool while the first one runs: that run
//      creates its own sandboxes without reading or writing the cache, and
//      records each one in pending/<pid>.json as it is created. The next run
//      that gets the lock adds them to the pool, however the earlier run
//      ended. The pool is in pool.mjs and pool-cache.mjs.
// Creating a sandbox needs an OIDC token. It comes from the environment, or the
// wrapper mints one with `vercel project token` for the logged-in user. With no
// token and no cached sandbox, the wrapper prints how to fix it and exits 1.
//
// Vitest then runs in a runner sandbox (runner.mjs) in the Testserver
// sandboxes' region, unless CI is set, a base is loopback or private,
// VERCEL_CLI_TEST_BINARY is set, or TESTSERVER_RUNNER=local
// (runner-config.mjs). The build mode, from TESTSERVER_RUNNER_BUILD, decides
// where the CLI is built: by default the runner builds it
// (modes/runner-build.mjs), so a runner run does no build work here; with
// `local`, this machine builds it before the mode lists the built files, and
// the runner only tests (modes/local-build.mjs). The runner needs the OIDC token on every run, or
// TESTSERVER_RUNNER_TOKEN, _TEAM_ID and _PROJECT_ID.
//
// A local run builds the CLI on this machine first, with
// `turbo run build:package --filter=vercel`, except under CI (the workflow
// builds it) or with VERCEL_CLI_TEST_BINARY (the binary is under test).
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLocally, shouldBuildLocally } from './build-locally.mjs';
import { localBuildMode } from './modes/local-build.mjs';
import { runnerBuildMode } from './modes/runner-build.mjs';
import { poolPaths } from './pool-cache.mjs';
import {
  exactSandboxCount,
  getOidcToken,
  mintHint,
  quoteArg,
  resolveSandboxes,
  secs,
} from './pool.mjs';
import {
  CLOSE_TIMEOUT_MS,
  describeRunnerError,
  RunnerError,
  runVitestInRunner,
} from './runner.mjs';
import {
  credentialsFromOidc,
  LOCAL_HINT,
  readRunnerConfig,
  runnerUnreachableReason,
} from './runner-config.mjs';

// The build modes, keyed by their TESTSERVER_RUNNER_BUILD value: what goes
// into the runner's snapshot and what each run uploads (see BuildMode in
// runner.mjs). The only place outside modes/ that names them.
const BUILD_MODES = { runner: runnerBuildMode, local: localBuildMode };

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const pool = poolPaths(join(repoRoot, 'node_modules', '.cache', 'testserver'));

function parseCommand(argv) {
  const sep = argv.indexOf('--');
  const command = sep === -1 ? [] : argv.slice(sep + 1);
  if (command.length === 0) {
    console.error('Usage: node scripts/testserver/main.mjs -- <command...>');
    process.exit(1);
  }
  return command;
}

const wrapperStartedAt = Date.now();

// Same parsing as testserverBases() in test/testserver/sandbox-pool.ts.
// Duplicates are dropped: each entry counts as a sandbox's worth of workers.
function splitBases(raw) {
  const bases = (raw ?? '')
    .split(',')
    .map(base => base.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set(bases)];
}

function printBox(lines) {
  const width = Math.max(...lines.map(l => l.length));
  const bar = '─'.repeat(width + 2);
  console.error(`┌${bar}┐`);
  for (const line of lines) {
    console.error(`│ ${line.padEnd(width)} │`);
  }
  console.error(`└${bar}┘`);
}

/** `sandboxes`: `{ testserver, testserverLogs? }[]`. */
function printSandboxes(sandboxes) {
  if (sandboxes.length === 1) {
    const [{ testserver, testserverLogs }] = sandboxes;
    const lines = [`Testserver: ${testserver}`];
    if (testserverLogs) lines.push(`Logs:       ${testserverLogs}`);
    printBox(lines);
    return;
  }
  const n = sandboxes.length;
  printBox(
    sandboxes.map(
      ({ testserver, testserverLogs }, i) =>
        `Testserver ${String(i + 1).padStart(String(n).length)}/${n}: ${testserver}${
          testserverLogs ? `  logs ${testserverLogs}` : ''
        }`
    )
  );
}

const buildPhase = buildMs =>
  buildMs === undefined ? '' : `build ${secs(buildMs)}, `;

function run(command, bases, sandboxSummary, sandboxMs, buildMs) {
  const env = { ...process.env };
  delete env.TESTSERVER_BASE;
  if (bases.length > 0) {
    env.TESTSERVER_BASES = bases.join(',');
  } else {
    delete env.TESTSERVER_BASES;
  }
  const child = spawn(command.map(quoteArg).join(' '), {
    env,
    stdio: 'inherit',
    shell: true,
  });
  const testsStartedAt = Date.now();
  child.on('exit', (code, signal) => {
    const testsMs = Date.now() - testsStartedAt;
    console.error(
      `[testserver] total ${secs(Date.now() - wrapperStartedAt)}: sandboxes ${secs(sandboxMs)} (${sandboxSummary}), ${buildPhase(buildMs)}tests ${secs(testsMs)}`
    );
    process.exit(signal ? 1 : (code ?? 1));
  });
}

/** std-env's agent detection, resolved through Vitest like the lane config. */
async function detectAgent() {
  const vitestRequire = createRequire(
    createRequire(import.meta.url).resolve('vitest/package.json')
  );
  const { isAgent } = await import(
    pathToFileURL(vitestRequire.resolve('std-env')).href
  );
  return Boolean(isAgent);
}

/** Runner credentials: the override variables, else the OIDC token. */
async function runnerCredentials(config) {
  if (config.override) return config.override;
  const { token, error, fix, source } = await getOidcToken();
  if (!token) {
    throw new RunnerError(
      `The runner sandbox needs an OIDC token, and minting one failed: ${error}\n\n${mintHint(fix)}\nOr set TESTSERVER_RUNNER_TOKEN, TESTSERVER_RUNNER_TEAM_ID and TESTSERVER_RUNNER_PROJECT_ID.`,
      { hint: LOCAL_HINT }
    );
  }
  try {
    return credentialsFromOidc(token);
  } catch (err) {
    throw new RunnerError(
      `${err.message} (from ${source === 'environment' ? 'VERCEL_TRUSTED_OIDC_IDP_TOKEN or VERCEL_OIDC_TOKEN' : '`vercel project token`'})`,
      { hint: LOCAL_HINT }
    );
  }
}

// 128 + the signal number, as a shell reports it.
const SIGNAL_EXIT_CODES = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
// How long a signalled run waits for the runner to stop before giving up:
// as long as the runner's close may take, so a snapshot in flight can finish
// and be cached.
const STOP_TIMEOUT_MS = CLOSE_TIMEOUT_MS;

let ignoringClosedTerminal = false;

/**
 * After SIGHUP the terminal is gone, and writing to it fails with EIO. Drop
 * those errors so the wrapper lives long enough to stop the runner.
 */
function ignoreClosedTerminal() {
  if (ignoringClosedTerminal) return;
  ignoringClosedTerminal = true;
  process.stdout.on('error', () => {});
  process.stderr.on('error', () => {});
}

/**
 * Run `vitest run ...` in a fresh runner sandbox. Every runner failure is
 * exit code 1; there is no fallback to local. Resolves to
 * `{ exitCode, phases, signalled }` and never rejects. When `buildHere` ran,
 * `phases` starts with `laptop build <secs>`.
 *
 * The first SIGINT, SIGTERM or SIGHUP stops the runner, and the exit code is
 * 130, 143 or 129. Later signals don't cut the stop short: exiting then would
 * leave the runner running until its timeout. If the stop takes longer than
 * `stopTimeoutMs`, it gives up and says so.
 *
 * `credentials`, `agent`, `buildHere`, `buildMode`, `runVitest` and `signals`
 * are replaceable in tests. `buildHere({ signal })`, when set, builds the CLI
 * on this machine and resolves to its ms, reported as the first phase; by
 * default it is set for TESTSERVER_RUNNER_BUILD=local. A signal stops the build, and the wrapper
 * waits up to `stopTimeoutMs` for it to exit; a failed build fails the run
 * without exiting the process. `buildMode()` returns the BuildMode (see
 * runner.mjs) the runner uses, or a promise of it; it runs after
 * `buildHere()`, because a mode may list the files the build wrote. Both run
 * alongside `credentials()`, and a throw fails the run before any sandbox
 * starts.
 *
 * @param {{
 *   command: string[];
 *   bases: string[];
 *   config: { timeoutMs: number; build?: string; override?: unknown };
 *   log?: (line: string) => void;
 *   credentials?: () => Promise<unknown>;
 *   agent?: () => Promise<boolean>;
 *   buildHere?: (ctx: { signal: AbortSignal }) => Promise<number>;
 *   buildMode?: () => unknown;
 *   runVitest?: (args: { vitestArgs: string[]; signal: AbortSignal } & Record<string, unknown>) => Promise<any>;
 *   signals?: Pick<NodeJS.EventEmitter, 'on' | 'off'>;
 *   stopTimeoutMs?: number;
 * }} options
 */
export async function runInSandbox({
  command,
  bases,
  config,
  log = line => console.error(line),
  credentials = () => runnerCredentials(config),
  agent = detectAgent,
  buildHere = config.build === 'local'
    ? ({ signal }) => buildLocally(repoRoot, { signal })
    : undefined,
  buildMode = () => BUILD_MODES[config.build]({ repoRoot }),
  runVitest = runVitestInRunner,
  signals = process,
  stopTimeoutMs = STOP_TIMEOUT_MS,
}) {
  const controller = new AbortController();
  let signalCode;
  let onFirstSignal = () => {};
  const signalled = new Promise(resolvePromise => {
    onFirstSignal = resolvePromise;
  });
  const handlers = Object.entries(SIGNAL_EXIT_CODES).map(([name, code]) => {
    const handler = () => {
      if (name === 'SIGHUP') ignoreClosedTerminal();
      if (signalCode !== undefined) {
        log(`[runner] ${name}: still stopping the runner...`);
        return;
      }
      signalCode = code;
      log(`\n[runner] ${name}: stopping the runner...`);
      controller.abort();
      onFirstSignal();
    };
    signals.on(name, handler);
    return [name, handler];
  });

  // The laptop build's phase, then the runner's.
  const buildPhases = [];
  // A RunnerError's message is written for the developer and carries its own
  // hint, if any; anything else is an SDK or API failure.
  const failed = (error, phases) => {
    if (error instanceof RunnerError) {
      log(`✗ ${error.message}`);
      if (error.hint) log(error.hint);
    } else {
      log(`✗ Runner sandbox failed: ${describeRunnerError(error)}`);
      log(LOCAL_HINT);
    }
    return {
      exitCode: 1,
      phases: [...buildPhases, ...phases],
      signalled: false,
    };
  };
  const stopped = (phases = []) => ({
    exitCode: signalCode ?? 1,
    phases: [...buildPhases, ...phases],
    signalled: true,
  });

  let stopTimer;
  let building;
  try {
    const setup = Promise.all([
      credentials(),
      agent(),
      (async () => {
        if (buildHere) {
          building = buildHere({ signal: controller.signal });
          buildPhases.push(`laptop build ${secs(await building)}`);
        }
        // A mode factory may throw synchronously.
        return buildMode();
      })(),
    ]);
    setup.catch(() => {});
    let ready;
    try {
      ready = await Promise.race([setup, signalled.then(() => undefined)]);
    } catch (error) {
      // A build the signal stopped rejects; that is a stop, not a failure.
      if (signalCode !== undefined) return stopped();
      return failed(error, []);
    }
    // A signal before the runner starts: there is no sandbox to stop, only
    // a build in flight, which the signal told to exit.
    if (!ready) {
      if (building) {
        await Promise.race([
          building.catch(() => {}),
          new Promise(resolvePromise => {
            stopTimer = setTimeout(resolvePromise, stopTimeoutMs);
          }),
        ]);
      }
      return stopped();
    }
    const [creds, isAgent, mode] = ready;

    const run = runVitest({
      vitestArgs: command.slice(1),
      bases,
      creds,
      isAgent,
      timeoutMs: config.timeoutMs,
      repoRoot,
      log,
      mode,
      signal: controller.signal,
    });
    const stopDeadline = signalled.then(
      () =>
        new Promise(resolvePromise => {
          stopTimer = setTimeout(
            () => resolvePromise({ outcome: 'stop-timeout' }),
            stopTimeoutMs
          );
        })
    );
    const result = await Promise.race([run, stopDeadline]);
    if (result.outcome === 'stop-timeout') {
      log(
        `✗ [runner] The runner did not stop within ${secs(stopTimeoutMs)}; its ${Math.round(config.timeoutMs / 60_000)}-minute timeout stops it.`
      );
      return stopped();
    }
    // A signal that raced the end of the run still wins.
    if (signalCode !== undefined || result.outcome === 'aborted') {
      return stopped(result.phases);
    }
    if (result.outcome === 'failed') return failed(result.error, result.phases);
    return {
      exitCode: result.exitCode,
      phases: [...buildPhases, ...result.phases],
      signalled: false,
    };
  } finally {
    clearTimeout(stopTimer);
    for (const [name, handler] of handlers) signals.off(name, handler);
  }
}

async function main() {
  const command = parseCommand(process.argv.slice(2));

  // Reject bad runner settings or TESTSERVER_SANDBOX_COUNT before any setup.
  let config;
  let exactCount;
  try {
    config = readRunnerConfig(process.env);
    exactCount = exactSandboxCount(process.env);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }

  const givenBases = splitBases(
    process.env.TESTSERVER_BASES || process.env.TESTSERVER_BASE
  );
  // Given bases a runner can't reach make the run local anyway.
  const runnerPossible =
    config.mode === 'runner' &&
    !(givenBases.length > 0 && runnerUnreachableReason(givenBases));
  if (runnerPossible && (command[0] !== 'vitest' || command[1] !== 'run')) {
    console.error(
      `✗ the runner expects \`vitest run ...\`, got \`${command.join(' ')}\``
    );
    console.error(LOCAL_HINT);
    process.exit(1);
  }

  let bases;
  let summary;
  let sandboxMs = 0;
  if (givenBases.length > 0) {
    printSandboxes(givenBases.map(testserver => ({ testserver })));
    bases = givenBases;
    summary = process.env.TESTSERVER_BASES
      ? 'TESTSERVER_BASES'
      : 'TESTSERVER_BASE';
  } else if (process.env.CI) {
    bases = [];
    summary = 'CI';
  } else {
    // The runner needs a token on every run: mint it while the cache is
    // health-checked.
    if (runnerPossible && !config.override) getOidcToken();
    const { sandboxes, reused, created } = await resolveSandboxes(
      command,
      exactCount,
      pool
    );
    sandboxMs = Date.now() - wrapperStartedAt;
    printSandboxes(sandboxes);
    bases = sandboxes.map(s => s.testserver);
    summary = `${reused} reused, ${created} created`;
  }

  const reason =
    config.mode === 'local' ? config.reason : runnerUnreachableReason(bases);
  if (reason === undefined) {
    const { exitCode, phases, signalled } = await runInSandbox({
      command,
      bases,
      config,
    });
    if (!signalled) {
      console.error(
        `[testserver] total ${secs(Date.now() - wrapperStartedAt)}: sandboxes ${secs(sandboxMs)} (${summary}), runner: ${phases.join(', ') || 'failed'}`
      );
    }
    process.exit(exitCode);
  }
  if (bases.length > 0 && !process.env.CI) {
    console.error(`[testserver] Running Vitest on this machine: ${reason}`);
  }
  let buildMs;
  if (shouldBuildLocally(process.env)) {
    try {
      buildMs = await buildLocally(repoRoot);
    } catch (err) {
      console.error(`✗ ${err.message}`);
      process.exit(1);
    }
  }
  run(command, bases, summary, sandboxMs, buildMs);
}

// Node resolves symlinks in import.meta.url but not in argv[1], so compare
// real paths: run through a symlink (e.g. /tmp on macOS), a plain comparison
// fails and the script exits 0 without running anything.
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) await main();
