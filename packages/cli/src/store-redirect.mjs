/* biome-ignore-all lint/suspicious/noConsole: CLI entry point helper */
// Managed CLI store redirect. Dependency-free; every failure path falls
// through to running the invoked version. See util/cli-store/README.md.

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const STORE_FORMAT = 1;

function storeRoot() {
  return process.env.VERCEL_CLI_STORE_DIR || join(homedir(), '.vercel', 'cli');
}

function isUnder(packageDir, base) {
  if (!base) return false;
  const candidates = [base];
  try {
    candidates.push(realpathSync(base));
  } catch {}
  return candidates.some(dir =>
    packageDir.startsWith(dir.replace(/[\\/]+$/, '') + sep)
  );
}

function ownPackageDir() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

function readPointer(root) {
  try {
    const pointer = JSON.parse(
      readFileSync(join(root, 'current.json'), 'utf8')
    );
    if (
      pointer &&
      pointer.storeFormat === STORE_FORMAT &&
      (pointer.type === 'npm' || pointer.type === 'native') &&
      typeof pointer.version === 'string'
    ) {
      return pointer;
    }
  } catch {}
  return undefined;
}

function storeEntrypoint(root, pointer) {
  const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
  return pointer.type === 'native'
    ? join(root, 'versions', 'native', pointer.version, 'bin', binaryName)
    : join(root, 'versions', 'npm', pointer.version, 'dist', 'vc.js');
}

// Global locations are decided from two exact facts: PNPM_HOME, and the
// running node's own global root. Anything else (project deps, unknown
// layouts) runs the invoked version. Kept in sync with util/cli-store.
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

// Strict x.y.z comparison; prereleases fail the parse and never redirect.
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

export async function redirectToStoreIfNewer() {
  const root = storeRoot();

  try {
    if (!isConfidentlyGlobal(ownPackageDir())) {
      return;
    }
  } catch {
    return;
  }

  const pointer = readPointer(root);
  if (!pointer) {
    return;
  }

  const { version } = await import('./version.mjs');
  // Native pointers always win (explicit user choice); npm must be newer.
  if (pointer.type !== 'native' && !gt(pointer.version, version)) {
    return;
  }

  const entrypoint = storeEntrypoint(root, pointer);
  if (!existsSync(entrypoint)) {
    return;
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
      // Loop guard; also the documented manual bypass.
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
    return;
  }

  // Fast unusual exit suggests a damaged store. Codes 1 (normal CLI
  // failure) and 2 (usage error) are excluded as expected fast exits.
  if (code !== 0 && code !== 1 && code !== 2 && Date.now() - startedAt < 2000) {
    console.error(
      `vercel: the managed CLI version at ${entrypoint} exited immediately ` +
        `with code ${code}. If this persists, the store may be damaged — ` +
        `delete ${root} to reset it, or set VERCEL_CLI_STORE=0 to bypass.`
    );
  }
  process.exit(code);
}

// `vc -v --verbose`: version plus install/store diagnostics for the invoked
// copy (no redirect). stdout stays machine-readable: bare version only.
export async function printVerboseVersion() {
  const root = storeRoot();
  const packageDir = ownPackageDir();

  let buildVersion;
  try {
    buildVersion = JSON.parse(
      readFileSync(join(packageDir, 'package.json'), 'utf8')
    ).version;
  } catch {}
  const { version } = await import('./version.mjs');

  let global = false;
  try {
    global = isConfidentlyGlobal(packageDir);
  } catch {}

  const pointer = readPointer(root);
  const storeCurrent = pointer && existsSync(storeEntrypoint(root, pointer));
  const wouldRedirect =
    global &&
    storeCurrent &&
    process.env.VERCEL_CLI_STORE !== '0' &&
    (pointer.type === 'native' || gt(pointer.version, version));

  const lines = [
    `Vercel CLI ${version}`,
    `build:          ${buildVersion ?? version}`,
    `native binary:  ${process.env.VERCEL_VC_NATIVE === '1' ? 'yes' : 'no'}`,
    `install path:   ${packageDir}`,
    `install type:   ${global ? 'global (store-eligible)' : 'not store-eligible (project dep or unrecognized layout)'}`,
    `store:          ${pointer ? `${root} → v${pointer.version} (${pointer.type})${storeCurrent ? '' : ' [payload missing]'}` : 'not enrolled'}`,
    `effective:      ${wouldRedirect ? `v${pointer.version} via store redirect` : `v${version} (this install)`}`,
  ];
  console.error(lines.join('\n'));
  console.log(version);
}
