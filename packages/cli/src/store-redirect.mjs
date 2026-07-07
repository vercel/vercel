/* biome-ignore-all lint/suspicious/noConsole: CLI entry point helper */
// Managed CLI store redirect. Deliberately dependency-free: this file runs
// before anything else in the CLI and must never be the reason the CLI
// fails to start. Every failure path falls through silently to running the
// version that was actually invoked.

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const STORE_FORMAT = 1;

function storeRoot() {
  return process.env.VERCEL_CLI_STORE_DIR || join(homedir(), '.vercel', 'cli');
}

// Expand a base dir to [raw, realpath'd] candidates; packageDir is
// realpath'd by node, the base may contain symlinks.
function prefixCandidates(base) {
  if (!base) return [];
  const candidates = [base];
  try {
    candidates.push(realpathSync(base));
  } catch {}
  return candidates;
}

function isUnder(packageDir, base) {
  return prefixCandidates(base).some(dir =>
    packageDir.startsWith(dir.replace(/[\\/]+$/, '') + sep)
  );
}

/**
 * Only installations in known-global locations participate in the store.
 * Decided from two facts the process holds exactly: PNPM_HOME (all pnpm
 * global layouts) and the running node's own global root (npm-style
 * managers: nvm, fnm, n, brew, system). Everything else — project deps,
 * unknown layouts — runs the version that was invoked. Misses under-serve;
 * they can never redirect a pinned install.
 */
export function isConfidentlyGlobal(packageDir) {
  if (isUnder(packageDir, process.env.PNPM_HOME)) {
    return true;
  }

  const nodeBin = dirname(process.execPath);
  const npmGlobalRoot =
    process.platform === 'win32'
      ? join(nodeBin, 'node_modules')
      : join(dirname(nodeBin), 'lib', 'node_modules');
  return isUnder(packageDir, npmGlobalRoot);
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

  // Only confidently-global installations participate. Project dependencies
  // (and anything ambiguous) always run exactly the version that was
  // invoked — the lockfile is authoritative.
  try {
    const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
    if (!isConfidentlyGlobal(packageDir)) {
      return;
    }
  } catch {
    return; // cannot determine own location — stay exact
  }

  let pointer;
  try {
    pointer = JSON.parse(readFileSync(join(root, 'current.json'), 'utf8'));
  } catch {
    return; // no store
  }
  if (
    !pointer ||
    pointer.storeFormat !== STORE_FORMAT ||
    (pointer.type !== 'npm' && pointer.type !== 'native') ||
    typeof pointer.version !== 'string'
  ) {
    return; // unknown store format — behave as if absent
  }

  const { version } = await import('./version.mjs');
  // A native pointer always wins (the user explicitly chose the binary via
  // `vc upgrade --binary`); an npm pointer must be strictly newer.
  if (pointer.type !== 'native' && !gt(pointer.version, version)) {
    return; // store is not newer; run the invoked version
  }

  // Version dirs are namespaced by payload type: npm payloads run via node
  // (versions/npm/<v>/dist/vc.js), native payloads are exec'd directly
  // (versions/native/<v>/bin/vercel).
  const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
  const entrypoint =
    pointer.type === 'native'
      ? join(root, 'versions', 'native', pointer.version, 'bin', binaryName)
      : join(root, 'versions', 'npm', pointer.version, 'dist', 'vc.js');
  if (!existsSync(entrypoint)) {
    return; // pointer names a missing version — fall through
  }

  const startedAt = Date.now();
  const [execCmd, execArgs] =
    pointer.type === 'native'
      ? [entrypoint, process.argv.slice(2)]
      : [process.execPath, [entrypoint, ...process.argv.slice(2)]];
  const child = spawn(execCmd, execArgs, {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      // Loop guard: the store version must not redirect again. Also acts
      // as a manual bypass and prevents infinite re-exec if the store's
      // contents ever disagree with the pointer (e.g. a version dir whose
      // files report a lower version than the pointer claims).
      VERCEL_CLI_STORE_REDIRECTED: '1',
    },
  });

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

  // A store version that dies almost immediately with an unusual exit code
  // suggests a damaged store (e.g. a pruned or corrupted node_modules)
  // rather than a normal CLI error. Leave a breadcrumb so the user is not
  // stuck with every command failing identically and no way to know why.
  // Excluded codes: 1 is the CLI's normal failure code (auth/validation
  // errors — and also Node's uncaught-exception code, so module-load
  // crashes are indistinguishable from ordinary errors and deliberately
  // not flagged); 2 is the CLI's usage-error code (e.g. unknown flags),
  // which exits fast by design. This hint is best-effort, not a detector.
  if (code !== 0 && code !== 1 && code !== 2 && Date.now() - startedAt < 2000) {
    console.error(
      `vercel: the managed CLI version at ${entrypoint} exited immediately ` +
        `with code ${code}. If this persists, the store may be damaged — ` +
        `delete ${root} to reset it, or set VERCEL_CLI_STORE=0 to bypass.`
    );
  }
  process.exit(code);
}
