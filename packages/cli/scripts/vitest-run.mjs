// Wrapper around vitest that accepts test file paths via VITEST_TEST_FILES env var
// instead of CLI arguments. This bypasses the Windows cmd.exe ~8191 char arg limit
// that turbo hits when passing many test paths through package.json scripts.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Resolve vitest's actual JS entry point from its package.json bin field.
// node_modules/.bin/vitest is a pnpm shell shim — running it directly with
// node causes a SyntaxError because node tries to parse shell script as JS.
// Use fileURLToPath (not .pathname) — on Windows .pathname returns "/D:/..."
// which Node resolves as "D:\D:\..." doubling the drive letter.
const require = createRequire(import.meta.url);
const vitestPkg = require('../../../node_modules/vitest/package.json');
const vitestBin = fileURLToPath(
  new URL(
    `../../../node_modules/vitest/${vitestPkg.bin.vitest}`,
    import.meta.url
  )
);

// Paths come from VITEST_TEST_FILES (CI, space-separated) or direct CLI args (local dev)
const envFiles = (process.env.VITEST_TEST_FILES ?? '')
  .split(' ')
  .filter(Boolean);
const files = envFiles.length > 0 ? envFiles : process.argv.slice(2);

// CI hardening: if vitest's fork pool hangs (leaked handles, server not closed),
// spawnSync with inherited stdio would block forever and the job would run until
// the workflow-level timeout (120m). Use async spawn + watchdog timers so we
// surface a actionable error and fail fast instead of burning runner minutes.
//
// Timeouts are generous: tests themselves have a 12m per-test/hook timeout in
// vitest.config.mts, chunks should finish well under 10m even on slow runners;
// the watchdog is just a safety net for runaway forks.
const CHUNK_TIMEOUT_MS = 20 * 60 * 1000; // total wall clock for the chunk
const GRACE_MS = 15_000; // after SIGTERM -> SIGKILL

const child = spawn(
  process.execPath,
  [vitestBin, '--config', './vitest.config.mts', ...files],
  {
    stdio: 'inherit',
    shell: false,
  }
);

let timedOut = false;
let hardKillTimer = null;

const chunkTimer = setTimeout(() => {
  timedOut = true;
  console.error(
    `\n[vitest-run] chunk timed out after ${CHUNK_TIMEOUT_MS / 1000}s — sending SIGTERM`
  );
  if (typeof child.kill === 'function') {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
  hardKillTimer = setTimeout(() => {
    console.error(
      '[vitest-run] still alive after grace period — sending SIGKILL'
    );
    try {
      child.kill('SIGKILL');
    } catch {}
  }, GRACE_MS);
  // Don't unref hardKillTimer: we want it to fire even if event loop is idle.
}, CHUNK_TIMEOUT_MS);
chunkTimer.unref?.();

child.on('exit', (code, signal) => {
  clearTimeout(chunkTimer);
  if (hardKillTimer) clearTimeout(hardKillTimer);

  if (timedOut) {
    console.error(
      `[vitest-run] chunk failed due to watchdog timeout (code=${code} signal=${signal}). ` +
        'This usually means a fork leaked handles (open server/timer) or a build dep hung.'
    );
    process.exit(124);
  }

  process.exit(code ?? (signal ? 1 : 0));
});

child.on('error', err => {
  clearTimeout(chunkTimer);
  if (hardKillTimer) clearTimeout(hardKillTimer);
  console.error('[vitest-run] failed to spawn vitest:', err);
  process.exit(1);
});
