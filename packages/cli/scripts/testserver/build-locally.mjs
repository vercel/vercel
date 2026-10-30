// Building the CLI on this machine with turbo, for runs that test the
// laptop's dist/: TESTSERVER_RUNNER=local runs, and runner runs with the
// TESTSERVER_RUNNER_BUILD=local build mode (modes/local-build.mjs). main.mjs
// runs it for both.
import execa from 'execa';
import { RunnerError } from './files.mjs';

/**
 * Whether a local run builds the CLI on this machine first: not under CI,
 * where the workflow builds it, and not with VERCEL_CLI_TEST_BINARY, which
 * tests a binary instead of dist/.
 */
export function shouldBuildLocally(env) {
  return !env.CI && !env.VERCEL_CLI_TEST_BINARY;
}

/**
 * Build the CLI in `repoRoot` with turbo, output inherited. Uses execa so
 * Windows can launch npm/Corepack's `pnpm.cmd` shim. Returns the build's ms.
 * Throws RunnerError when the build fails or pnpm cannot start; the caller
 * decides how the process exits. Aborting `signal` terminates the build and
 * rejects with the abort reason once it has exited.
 *
 * @param {string} repoRoot
 * @param {{
 *   signal?: AbortSignal;
 *   run?: (
 *     file: string,
 *     args: string[],
 *     options: import('execa').Options
 *   ) => PromiseLike<{ failed: boolean; message: string }> & {
 *     kill: (signal?: string) => void;
 *   };
 * }} [options] `run` launches the command; execa unless a test swaps it.
 */
export async function buildLocally(repoRoot, { signal, run = execa } = {}) {
  const startedAt = Date.now();
  console.error(
    '[testserver] Building the CLI on this machine: turbo run build:package --filter=vercel'
  );
  const child = run(
    'pnpm',
    [
      'exec',
      'turbo',
      '--no-update-notifier',
      'run',
      'build:package',
      '--filter=vercel',
    ],
    { cwd: repoRoot, stdio: 'inherit', reject: false }
  );
  const stop = () => child.kill('SIGTERM');
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });
  let result;
  try {
    result = await child;
  } finally {
    signal?.removeEventListener('abort', stop);
  }
  signal?.throwIfAborted();
  if (result.failed) {
    throw new RunnerError(
      `Building the CLI on this machine failed, so not running the tests: ${result.message}`
    );
  }
  return Date.now() - startedAt;
}
