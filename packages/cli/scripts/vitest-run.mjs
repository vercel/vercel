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

const files = process.argv.slice(2);

// CI hardening: if vitest's fork pool hangs (leaked handles, server not closed),
// spawnSync with inherited stdio would block forever and the job would run until
// the workflow-level timeout (120m). Use async spawn + watchdog timers so we
// surface a actionable error and fail fast instead of burning runner minutes.
//
// Tests themselves have a 12m per-test/hook timeout in vitest.config.mts. The
// watchdog is a safety net for runaway forks, not a normal suite timeout.
const CHUNK_TIMEOUT_MS = 30 * 60 * 1000;
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
