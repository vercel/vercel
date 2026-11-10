#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: CLI entry point */
// This shim defers loading the real module until the compile cache is enabled.
// https://nodejs.org/api/module.html#moduleenablecompilecachecachedir
// enableCompileCache was added in Node.js 22.8.0, so we need to handle older versions.
const entryAt = performance.now();
Reflect.set(globalThis, Symbol.for('vercel.cli.entry-at'), entryAt);
try {
  const { enableCompileCache } = await import('node:module');
  if (enableCompileCache) {
    enableCompileCache();
  }
} catch {}

// Run the one package this platform maps to: the native binary on macOS and
// Linux x64/arm64 (downloaded once into the CLI cache when the install skipped
// it), @vercel/cli-support everywhere else. This package's own JS CLI
// (./index.js) is only a fallback, recorded in telemetry.
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Keep in sync with packages/vc-native/scripts/platforms.mjs. Windows runs
// only the Node CLI until its native binaries are signed.
const NATIVE_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
];

// musl's `ldd` names itself. npm and pnpm skip the other libc's package via
// its `libc` field, but Yarn classic installs both, so the launcher must pick
// one.
function isMusl() {
  const ldd = spawnSync('ldd', ['--version'], { encoding: 'utf8' });
  return `${ldd.stdout ?? ''}${ldd.stderr ?? ''}`.includes('musl');
}

function platformTarget() {
  const target = `${process.platform}-${process.arch}`;
  return process.platform === 'linux' && isMusl() ? `${target}-musl` : target;
}

// Walk up from this install's own tree. `require.resolve()` is not used
// because it falls back to NODE_PATH and the global folders even when `paths`
// is given.
function findPackage(name) {
  let dir = __dirname;
  while (true) {
    const pkgDir = join(dir, 'node_modules', name);
    if (existsSync(join(pkgDir, 'package.json'))) return pkgDir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The package this platform maps to: a native target or `cli-support`.
function mappedTarget() {
  const target = platformTarget();
  return NATIVE_TARGETS.includes(target) ? target : 'cli-support';
}

function resolveTarget() {
  const target = mappedTarget();
  if (target === 'cli-support') {
    const pkgDir = findPackage('@vercel/cli-support');
    const entry = pkgDir && join(pkgDir, 'dist', 'index.js');
    return {
      target: 'cli-support',
      entry: entry && existsSync(entry) && entry,
    };
  }
  const pkgDir = findPackage(`@vercel/vc-native-${target}`);
  const bin =
    pkgDir &&
    [join(pkgDir, 'bin', 'vercel'), join(pkgDir, 'vercel')].find(existsSync);
  return { target, bin };
}

// The package this launcher belongs to: `vercel` or `@vercel/cli-support`.
let ownPackage;
function readOwnPackage() {
  if (ownPackage === undefined) {
    try {
      ownPackage = JSON.parse(
        readFileSync(join(__dirname, '..', 'package.json'))
      );
    } catch {
      ownPackage = null;
    }
  }
  return ownPackage;
}

// This file also ships in @vercel/cli-support, which is its own JS CLI.
function isCliSupport() {
  return readOwnPackage()?.name === '@vercel/cli-support';
}

// Flags that make stdout a JSON document, so stderr must stay quiet.
function wantsJsonOutput(argv) {
  const formatIndex = argv.indexOf('--format');
  return (
    argv.some(arg => arg === '--json' || arg === '--format=json') ||
    (formatIndex !== -1 && argv[formatIndex + 1] === 'json')
  );
}

// When the native package is missing (an install that skipped optional
// dependencies, or one made before npm had the package), download the binary
// for this exact version into the CLI cache, once. Each version has its own
// directory, so a binary is written once and never replaced.
const DOWNLOAD_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

async function nativeCacheDir(target) {
  const version = readOwnPackage()?.version;
  if (
    typeof version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)
  ) {
    return null;
  }
  try {
    const config = await import('@vercel/cli-config/paths');
    return {
      version,
      dir: join(config.getCachePath(), 'native', version, target),
    };
  } catch {
    return null;
  }
}

async function fetchNativeBinary(target) {
  // Only an installed package uses the download. A repository checkout
  // (packages/cli/dist/vc.js) runs its own JS CLI, so local changes and tests
  // never run a published binary instead.
  if (!__dirname.split(sep).includes('node_modules')) {
    return { reason: 'target_missing' };
  }
  const cache = await nativeCacheDir(target);
  if (!cache) return { reason: 'target_missing' };
  const bin = join(cache.dir, 'vercel');
  if (existsSync(bin)) return { bin, source: 'cache' };

  // Tests only: never reach the real registry.
  if (process.env.__VERCEL_NATIVE_DOWNLOAD === '0') {
    return { reason: 'target_missing' };
  }
  // Without a writable cache the binary has nowhere to go and a failure can't
  // be recorded, so every run would try and warn again. Use the JS CLI quietly.
  try {
    mkdirSync(cache.dir, { recursive: true });
    accessSync(cache.dir, fsConstants.W_OK);
  } catch {
    return { reason: 'target_missing' };
  }
  const failedStamp = join(cache.dir, 'download-failed');
  try {
    if (Date.now() - statSync(failedStamp).mtimeMs < DOWNLOAD_RETRY_AFTER_MS) {
      return { reason: 'download_failed' };
    }
  } catch {}

  const quiet = wantsJsonOutput(process.argv.slice(2));
  try {
    const { downloadNativeBinary } = await import('./native-download.js');
    return {
      bin: await downloadNativeBinary({
        target,
        version: cache.version,
        directory: cache.dir,
        log: quiet ? undefined : line => console.error(line),
      }),
      source: 'download',
    };
  } catch (error) {
    try {
      writeFileSync(failedStamp, '');
    } catch {}
    if (!quiet) {
      const detail =
        error?.name === 'NativeDownloadError'
          ? error.detail
          : 'unexpected error';
      console.error(
        `! Couldn't download the Vercel CLI binary (${detail}), so Node.js is running this command. The CLI tries again in 24 hours.`
      );
    }
    return { reason: 'download_failed' };
  }
}

// The native binary is the default, but this release still honors an explicit
// opt-out: VERCEL_CLI_USE_NATIVE_BINARY, then a persisted `useNativeBinary`
// preference. Any failure to read config counts as no preference.
async function isNativeBinaryOptedOut() {
  const envOverride = process.env.VERCEL_CLI_USE_NATIVE_BINARY;
  if (envOverride === '0' || envOverride === 'false') return true;
  if (envOverride === '1' || envOverride === 'true') return false;
  try {
    // Zod-free subpath to avoid loading zod + schemas on this hot path.
    const config = await import('@vercel/cli-config/paths');
    const argDir = globalConfigDirFromArgv();
    const configDir = argDir
      ? resolve(process.cwd(), argDir)
      : config.getGlobalPathConfig();
    return (
      config.readGlobalConfigFlag(
        config.getConfigFilePath(configDir),
        'useNativeBinary'
      ) === false
    );
  } catch {
    return false;
  }
}

// When the OS cannot start the binary at all, no command code has run, so
// Node.js can safely run the command instead.
const NATIVE_SPAWN_FALLBACK_CODES = ['ENOENT', 'EACCES', 'ENOEXEC'];

// Read by src/index.ts and reported in telemetry. Inside the native binary,
// pkg.js sets it to `native` before re-entering this file with
// VERCEL_VC_NATIVE=1.
const LAUNCH = Symbol.for('vercel.cli.launch');
let launch;
let cliSupportEntry;
if (process.env.VERCEL_VC_NATIVE === '1') {
  if (globalThis[LAUNCH]?.runtime !== 'native') {
    // Not the native binary: a process it spawned (a build script, a dev
    // command) inherited VERCEL_VC_NATIVE=1 and ran this package's JS CLI.
    launch = {
      runtime: 'dist',
      target: mappedTarget(),
      reason: 'inherited_native_env',
    };
    globalThis[LAUNCH] = launch;
  }
} else {
  const resolved = resolveTarget();
  let optedOut = false;
  let missingReason = 'target_missing';
  if (resolved.bin) {
    optedOut = await isNativeBinaryOptedOut();
  } else if (resolved.target !== 'cli-support' && !isCliSupport()) {
    // Never download for an opted-out user or for @vercel/cli-support (the
    // build container runs it on Linux).
    optedOut = await isNativeBinaryOptedOut();
    if (!optedOut) {
      const fetched = await fetchNativeBinary(resolved.target);
      resolved.bin = fetched.bin;
      resolved.source = fetched.source;
      missingReason = fetched.reason ?? missingReason;
    }
  }
  if (optedOut) {
    launch = { runtime: 'dist', target: resolved.target, reason: 'opt_out' };
  } else if (resolved.bin) {
    // Internal worker arguments intentionally trampoline too. The packaged
    // native binary sets VERCEL_VC_NATIVE=1 in pkg.js and re-enters this file,
    // where the worker branch below handles the request.
    const r = spawnSync(resolved.bin, process.argv.slice(2), {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        VERCEL_VC_NATIVE: '1',
        // Upgrades belong to the vercel package, not its native runtime
        // dependency. Always replace an inherited value with this launcher's
        // own entrypoint.
        VERCEL_CLI_PACKAGE_ENTRYPOINT: fileURLToPath(import.meta.url),
        VERCEL_CLI_PACKAGE_EXECUTABLE: resolved.bin,
        // Reported in telemetry. pkg.js reads it and removes it, so the
        // binary's child processes don't inherit it.
        ...(resolved.source && {
          __VERCEL_CLI_NATIVE_SOURCE: resolved.source,
        }),
      },
    });
    // Never fall back on an exit status: a loader failure (e.g. glibc
    // mismatch) and a command's own failure are indistinguishable, and
    // retrying a command in Node.js could repeat remote mutations.
    if (!(r.error && NATIVE_SPAWN_FALLBACK_CODES.includes(r.error.code))) {
      if (r.error) {
        console.error(r.error.message);
        process.exit(1);
      }
      if (r.signal) {
        try {
          process.kill(process.pid, r.signal);
        } catch {}
      }
      process.exit(r.status ?? 1);
    }
    console.error(
      `! The native Vercel CLI binary could not start (${r.error.code}), so Node.js is running this command.`
    );
    launch = { runtime: 'dist', target: resolved.target, reason: r.error.code };
  } else if (resolved.entry || isCliSupport()) {
    launch = { runtime: 'cli-support' };
  } else {
    launch = {
      runtime: 'dist',
      target: resolved.target,
      reason: missingReason,
    };
  }
  globalThis[LAUNCH] = launch;
  cliSupportEntry = resolved.entry;
}

if (process.argv[2] === '--internal-build-worker') {
  const {
    applyInternalBuildRequest,
    InternalBuildWorkerReport,
    preloadInternalBuild,
    waitForInternalBuildRequest,
  } = await import('./internal-build-worker.js');
  const report = new InternalBuildWorkerReport({ entryAt });
  // Only module loading belongs here: argv, env, and cwd still belong to the
  // prewarm process until the build request is applied.
  const handoff = await waitForInternalBuildRequest(
    process.argv.slice(2),
    () =>
      preloadInternalBuild(
        () => import('./commands/build/index.js'),
        () => import('./internal-build.js'),
        report
      ),
    { report }
  );
  // A prewarmed worker idles until its request arrives; start startup
  // telemetry from the handoff instead of process entry.
  Reflect.set(globalThis, Symbol.for('vercel.cli.entry-at'), performance.now());
  globalThis[Symbol.for('vercel.cli.fatal-error-handler')] = error =>
    handoff.error(error);

  try {
    // The caller must provide the complete environment for a non-interactive
    // build-container invocation before normal CLI initialization starts.
    applyInternalBuildRequest(handoff.request);
    const { runInternalBuild } = await import('./internal-build.js');
    let exitCode = await runInternalBuild();
    if (exitCode === undefined) {
      // Importing index.js starts the full CLI with the applied request.
      const { cliPromise } = await import('./index.js');
      exitCode = await cliPromise;
    }
    await handoff.complete(exitCode ?? 0);
  } catch (error) {
    await handoff.error(error);
    process.exitCode = 1;
  }

  process.exit(process.exitCode ?? 0);
}

// Read `--global-config`/`-Q` without loading the full CLI arg parser.
function globalConfigDirFromArgv() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--global-config' || arg === '-Q') {
      return argv[i + 1];
    }
    if (arg.startsWith('--global-config=')) {
      return arg.slice('--global-config='.length);
    }
  }
  return undefined;
}

// Linux on anything but x64/arm64 has no native binary, and will lose the JS
// CLI from `vercel` itself in a future release.
async function warnDeprecatedArch() {
  if (
    process.platform !== 'linux' ||
    ['x64', 'arm64'].includes(process.arch) ||
    process.env.VERCEL_VC_NATIVE === '1'
  ) {
    return;
  }
  const argv = process.argv.slice(2);
  if (
    argv.some(arg =>
      ['--non-interactive', '--non-interactive=true'].includes(arg)
    ) ||
    wantsJsonOutput(argv)
  ) {
    return;
  }
  let stamp;
  try {
    const config = await import('@vercel/cli-config/paths');
    const argDir = globalConfigDirFromArgv();
    const configDir = argDir
      ? resolve(process.cwd(), argDir)
      : config.getGlobalPathConfig();
    if (existsSync(configDir)) {
      stamp = join(configDir, '.arch-deprecation-warned');
      if (Date.now() - statSync(stamp).mtimeMs < 24 * 60 * 60 * 1000) return;
    }
  } catch {}
  const target = `${process.platform}-${process.arch}`;
  console.error(
    `! Support for ${target} will be removed from the vercel package in a future release.`
  );
  if (stamp) {
    try {
      writeFileSync(stamp, '');
    } catch {}
  }
}

await warnDeprecatedArch();

// Fast path for --version to avoid loading the entire CLI
if (
  process.argv.length === 3 &&
  (process.argv[2] === '--version' || process.argv[2] === '-v')
) {
  const { version, buildLabel } = await import('./version.mjs');
  const labels = [];
  if (process.env.VERCEL_VC_NATIVE === '1') labels.push('native');
  // Optional build metadata stamped by CI (e.g. "pr-115 abc1234").
  if (buildLabel) labels.push(buildLabel);
  const suffix = labels.length > 0 ? ` (${labels.join(', ')})` : '';
  console.error(`Vercel CLI ${version}${suffix}`);
  console.log(version);
  process.exit(0);
}

// Fast path for --help to avoid loading the entire CLI. The build generates
// root-help-commands.mjs from the command registry; without it, fall through
// to the full CLI, which renders the same help from the registry.
if (
  process.argv.length === 3 &&
  (process.argv[2] === '--help' || process.argv[2] === '-h')
) {
  let rootHelp;
  try {
    const { version } = await import('./version.mjs');
    const { help } = await import('./help.js');
    const { rootHelpCommands } = await import('./root-help-commands.mjs');
    rootHelp = {
      version,
      text: help(rootHelpCommands, process.stdout.columns),
    };
  } catch {
    rootHelp = undefined;
  }
  if (rootHelp) {
    console.error(`Vercel CLI ${rootHelp.version}`);
    process.stdout.write(rootHelp.text);
    process.exit(0);
  }
}

try {
  await (cliSupportEntry
    ? import(pathToFileURL(cliSupportEntry).href)
    : import('./index.js'));
} catch (error) {
  // The mapped package is missing and this package's own JS CLI cannot load
  // either, so name the package to install.
  if (
    launch?.reason === 'target_missing' &&
    error?.code === 'ERR_MODULE_NOT_FOUND'
  ) {
    const pkg =
      launch.target === 'cli-support'
        ? '@vercel/cli-support'
        : `@vercel/vc-native-${launch.target}`;
    console.error(
      `Error: ${pkg} is not installed. Reinstall vercel without omitting optional dependencies (for example, npm i -g vercel@latest).`
    );
    console.error(error.message);
    process.exit(1);
  }
  // Global-config paths are resolved during module initialization, before the
  // command router and its client exist. Report local parser failures without
  // dumping a stack or loading configuration again to construct the error.
  if (
    error?.name !== 'ArgError' ||
    ![
      'ARG_UNKNOWN_OPTION',
      'ARG_MISSING_REQUIRED_LONGARG',
      'ARG_MISSING_REQUIRED_SHORTARG',
    ].includes(error.code)
  ) {
    throw error;
  }
  let nonInteractive = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--') break;
    if (arg === '--non-interactive' || arg === '--non-interactive=true') {
      nonInteractive = true;
    } else if (arg === '--non-interactive=false') {
      nonInteractive = false;
    }
  }
  if (nonInteractive) {
    console.log(
      JSON.stringify(
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error.message,
        },
        null,
        2
      )
    );
  } else {
    console.error(`✗ ${error.message}`);
  }
  // A usage error, like every other unknown or incomplete option.
  process.exit(2);
}
