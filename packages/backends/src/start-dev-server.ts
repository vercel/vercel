import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Path to the host script (built by tsdown to dist/dev/cron-host.mjs).
// Sibling of dist/index.mjs, which is where this module is bundled.
const CRON_HOST_PATH = fileURLToPath(
  new URL('./dev/cron-host.mjs', import.meta.url)
);

import {
  debug,
  FileBlob,
  isScheduleTriggeredService,
  NowBuildError,
  runNpmInstall,
  scanParentDirs,
  type StartDevServer,
} from '@vercel/build-utils';
import { findEntrypointWithHintOrThrow } from './find-entrypoint.js';
import { applyCronDispatch } from './cron-dispatch.js';
import { buildCronRouteTable, getServiceCrons } from './crons.js';
import { spawnCronHost } from './dev/spawn-cron-host.js';
import { resolveEntrypointAndFormat } from './rolldown/resolve-format.js';

/**
 * Dev-mode entrypoint for `@vercel/backends`. For schedule-triggered
 * JS/TS services, generates the same dispatcher shim used in production
 * (via `applyCronDispatch`) into a tmp directory and hosts it over an
 * HTTP server in a child process. Returns `null` for any other service
 * shape so the CLI can fall through to its other paths.
 */
export const startDevServer: StartDevServer = async opts => {
  const { workPath, meta = {}, service, onStdout, onStderr } = opts;

  // Bail before entrypoint resolution for service shapes we don't
  // handle: avoids running findEntrypointOrThrow on workspaces we're
  // about to reject (and that may not even be node-shaped).
  if (!service || !isScheduleTriggeredService(service)) {
    return null;
  }

  const entrypoint = await findEntrypointWithHintOrThrow(
    workPath,
    opts.entrypoint
  );

  const cronEntries = await getServiceCrons({ service, entrypoint });
  if (!cronEntries) {
    return null;
  }

  const userModuleAbs = join(workPath, entrypoint);
  if (!existsSync(userModuleAbs)) {
    throw new NowBuildError({
      code: 'BACKENDS_CRON_ENTRYPOINT_NOT_FOUND',
      message: `cron service entrypoint "${entrypoint}" not found in ${workPath}`,
    });
  }

  // Install user deps if the orchestrator requested it.
  if (meta.syncDependencies) {
    await maybeInstallDeps(workPath);
  }

  // For dev we host the shim out of a tmp dir, so we override the user module
  // import path to point directly at the user file.
  // - a `file://` URL for ESM (which `import` accepts)
  // - the absolute fs path for CJS (which `require()` accepts).
  const { format } = await resolveEntrypointAndFormat({
    entrypoint,
    workPath,
    defaultFormat: 'cjs',
  });
  const modulePathOverride =
    format === 'esm' ? pathToFileURL(userModuleAbs).href : userModuleAbs;

  const dispatchResult = await applyCronDispatch({
    files: {},
    handler: entrypoint,
    workPath,
    routes: buildCronRouteTable(cronEntries),
    modulePathOverride,
  });
  const shimEntry = dispatchResult.files[dispatchResult.handler];
  if (!(shimEntry instanceof FileBlob)) {
    throw new NowBuildError({
      code: 'BACKENDS_CRON_SHIM_GENERATION_FAILED',
      message: `could not generate cron dispatcher shim for service "${service.name}"`,
    });
  }
  const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;
  let spawned;
  try {
    spawned = await spawnCronHost({
      hostPath: CRON_HOST_PATH,
      shimSource: shimEntry.data.toString(),
      shimFileName: basename(dispatchResult.handler),
      cwd: dirname(userModuleAbs),
      env,
      port: typeof meta.port === 'number' ? meta.port : undefined,
    });
  } catch (err) {
    throw new NowBuildError({
      code: 'BACKENDS_CRON_HOST_SPAWN_FAILED',
      message: `could not spawn cron host for service "${service.name}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  const { child, pid, port, shimDir } = spawned;

  debug(`Started backends cron host [PORT=${port}, PID=${pid}]`);
  debug(`  shim:       ${join(shimDir, basename(dispatchResult.handler))}`);
  debug(`  entrypoint: ${userModuleAbs}`);

  child.stdout?.on('data', (chunk: Buffer) => {
    if (onStdout) onStdout(chunk);
    else process.stdout.write(chunk as Uint8Array);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    if (onStderr) onStderr(chunk);
    else process.stderr.write(chunk as Uint8Array);
  });

  // Surface early-exit failures so they don't manifest as a port
  // timeout. The orchestrator races `checkForPort` against the child;
  // we just attach the listener so the rejection isn't unhandled.
  const earlyExit = new Promise<never>((_, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      reject(
        new Error(
          `cron host for service "${service.name}" exited before binding (code=${code}, signal=${signal})`
        )
      );
    });
  });
  earlyExit.catch(() => {
    /* surfaced via port timeout / shutdown path */
  });

  const shutdown = async () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    await rm(shimDir, { recursive: true, force: true }).catch(() => undefined);
  };

  return { port, pid, shutdown, crons: cronEntries };
};

const PENDING_INSTALLS = new Map<string, Promise<void>>();

/**
 * Install workspace deps for a service before we spawn it, using the
 * detected package manager.
 *
 * Two services that share the same workPath will race to install deps.
 * The pending installs mechanism deduplicates the install, preventing
 * potential races. The map clears on settle so subsequent calls re-run
 * install rather than returning a stale "already installed" result.
 */
function maybeInstallDeps(workPath: string): Promise<void> {
  if (!existsSync(join(workPath, 'package.json'))) {
    return Promise.resolve();
  }
  let pending = PENDING_INSTALLS.get(workPath);
  if (!pending) {
    pending = installDeps(workPath);
    PENDING_INSTALLS.set(workPath, pending);
    pending.finally(() => PENDING_INSTALLS.delete(workPath));
  }
  return pending;
}

async function installDeps(workPath: string): Promise<void> {
  const { cliType, lockfileVersion, packageJsonPackageManager } =
    await scanParentDirs(workPath, true);
  await runNpmInstall(workPath, [], {
    env: process.env,
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
  } as Parameters<typeof runNpmInstall>[2]).catch((err: unknown) => {
    debug(
      `npm install failed: ${err instanceof Error ? err.message : String(err)}`
    );
    // Soft-fail; the user can still run install manually. Hard-fail
    // would block dev for users whose `node_modules` is already in
    // place but whose lockfile is out of sync.
  });
}
