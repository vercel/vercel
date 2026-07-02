/* biome-ignore-all lint/suspicious/noConsole: CLI entry point helper */
// Managed CLI store redirect. Deliberately dependency-free: this file runs
// before anything else in the CLI and must never be the reason the CLI
// fails to start. Every failure path falls through silently to running the
// version that was actually invoked.

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const STORE_FORMAT = 1;

function storeRoot() {
  return process.env.VERCEL_CLI_STORE_DIR || join(homedir(), '.vercel', 'cli');
}

// Minimal semver x.y.z comparison (no prerelease/range support — the store
// only ever holds published release versions). Returns true when a > b.
function gt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  if (pa.length !== 3 || pb.length !== 3) return false;
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

/**
 * When the store pointer names a newer, present version than the running
 * package, re-exec the CLI from the store and exit with its code. Otherwise
 * return and let the invoked version run.
 */
export async function redirectToStoreIfNewer() {
  const root = storeRoot();

  let pointer;
  try {
    pointer = JSON.parse(readFileSync(join(root, 'current.json'), 'utf8'));
  } catch {
    return; // no store
  }
  if (
    !pointer ||
    pointer.storeFormat !== STORE_FORMAT ||
    pointer.type !== 'npm' ||
    typeof pointer.version !== 'string'
  ) {
    return; // unknown store format — behave as if absent
  }

  const { version } = await import('./version.mjs');
  if (!gt(pointer.version, version)) {
    return; // store is not newer; run the invoked version
  }

  // Version dirs are namespaced by payload type (versions/npm/<v>). This
  // shim only understands the 'npm' payload; readPointer-equivalent checks
  // above already rejected other types.
  const entrypoint = join(
    root,
    'versions',
    'npm',
    pointer.version,
    'dist',
    'vc.js'
  );
  if (!existsSync(entrypoint)) {
    return; // pointer names a missing version — fall through
  }

  const child = spawn(
    process.execPath,
    [entrypoint, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        // Loop guard: the store version must not redirect again.
        VERCEL_CLI_STORE_REDIRECTED: '1',
      },
    }
  );

  const code = await new Promise(resolve => {
    child.on('error', () => resolve(undefined));
    child.on('close', (exitCode, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        resolve(1);
        return;
      }
      resolve(exitCode === null ? 1 : exitCode);
    });
  });

  if (code === undefined) {
    return; // spawn failed — fall through to running the invoked version
  }
  process.exit(code);
}
