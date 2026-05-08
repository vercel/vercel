import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
import { resolveEntrypointAndFormat } from './rolldown/resolve-format.js';

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const addr = srv.address() as AddressInfo | null;
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('could not allocate a free port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

// Path to the host script (built by tsdown to dist/dev/cron-host.mjs).
// Sibling of dist/index.mjs, which is where this module is bundled.
const CRON_HOST_PATH = fileURLToPath(
  new URL('./dev/cron-host.mjs', import.meta.url)
);

// `tsx` is a runtime dependency of @vercel/backends; resolved here so the
// spawned Node process can transpile .ts/.mts/.cts user entrypoints
// transparently via `--import <tsx>`.
const require_ = createRequire(import.meta.url);
function resolveTsxBin(): string {
  return require_.resolve('tsx');
}

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
  const shimSource = shimEntry.data.toString();
  const shimFileName = basename(dispatchResult.handler);

  const tmpDir = await mkdtemp(join(tmpdir(), `vc-be-cron-${service.name}-`));
  const shimAbs = join(tmpDir, shimFileName);
  await writeFile(shimAbs, shimSource, 'utf-8');

  const port = typeof meta.port === 'number' ? meta.port : await getFreePort();
  const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;
  env.__VC_DISPATCH_SHIM_ABS = shimAbs;
  env.__VC_PORT = String(port);

  let tsxBin: string;
  try {
    tsxBin = resolveTsxBin();
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw new NowBuildError({
      code: 'BACKENDS_TSX_NOT_RESOLVABLE',
      message: `could not resolve "tsx" runtime dependency: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  const args = ['--import', tsxBin, CRON_HOST_PATH];

  debug(`Starting backends cron host: node ${args.join(' ')} [PORT=${port}]`);
  debug(`  shim:       ${shimAbs}`);
  debug(`  entrypoint: ${userModuleAbs}`);

  const child: ChildProcess = spawn(process.execPath, args, {
    cwd: dirname(userModuleAbs),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  if (!child.pid) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw new NowBuildError({
      code: 'BACKENDS_CRON_HOST_SPAWN_FAILED',
      message: `could not spawn cron host for service "${service.name}"`,
    });
  }

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

  const pid = child.pid;
  const shutdown = async () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  };

  return { port, pid, shutdown, crons: cronEntries };
};

/**
 * Run `npm install` (or the equivalent for the detected package manager)
 * if the workspace has a package.json. No-op when the cron service is a
 * tiny project with no deps (only vercel.json + an entrypoint).
 */
async function maybeInstallDeps(workPath: string): Promise<void> {
  if (!existsSync(join(workPath, 'package.json'))) {
    return;
  }
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
