import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  cloneEnv,
  debug,
  getLambdaOptionsFromFunction,
  getReportedServiceType,
  type BuildOptions,
  type BuildResultV2Typical,
  type BuildResultV3,
  type BuildResultVX,
  type File,
  type Files,
  type StartDevServerOptions,
  type StartDevServerResult,
} from '@vercel/build-utils';
import {
  createStandaloneLambda,
  startDevProxy,
  type DevProxyHandle,
} from '@vercel-internals/ipc-proxy';

import { installRustToolchain } from './lib/rust-toolchain';
import {
  assertStandaloneBinary,
  findCargoBuildConfiguration,
  findCargoWorkspace,
  getCargoMetadata,
  hasVercelRuntimeDependency,
  resolvedPackageUsesVercelRuntime,
  resolveStandaloneBinary,
} from './lib/cargo';
import {
  compileCargoBinary,
  createRustEnv,
  getRustHostTargetTriple,
  getTargetTriple,
  resolveCompiledBinaryPath,
  type RustEnv,
} from './lib/compile';
import { gatherExtraFiles, runUserScripts } from './lib/utils';
import { generateProjectManifest } from './diagnostics';

/**
 * Output path for the standalone server Lambda.
 *
 * Deliberately not `index`: the filesystem handler resolves `/` to an `index`
 * output, so a rewrite landing on `/` would dispatch there before the catch-all
 * below can copy the resolved destination into the runtime request path.
 */
export const STANDALONE_LAMBDA_PATH = 'rust';

/**
 * V1 services are routed by fs-detectors, which merges every service into one
 * shared top-level table where a catch-all would shadow its siblings. Every
 * other build owns its route table and needs the catch-all to reach the Lambda.
 */
function ownsRouteTable(service: BuildOptions['service']): boolean {
  return !(service?.name && service.type);
}

export function getStandaloneServerRoutes(
  service: BuildOptions['service']
): BuildResultV2Typical['routes'] {
  if (!ownsRouteTable(service)) {
    return undefined;
  }

  return [
    { handle: 'filesystem' as const },
    {
      src: '/(.*)',
      dest: `/${STANDALONE_LAMBDA_PATH}`,
      transforms: [
        {
          type: 'request.path' as const,
          op: 'set' as const,
          args: '/$1',
        },
      ],
    },
  ];
}

/**
 * The framework presets cannot supply this fallback because standalone builds
 * need to preserve the resolved rewrite destination instead. Keep it on the
 * legacy build result, where it only applies to `vercel_runtime` servers.
 */
export function getVercelRuntimeRoutes(
  entrypoint: string,
  service: BuildOptions['service']
): BuildResultV3['routes'] {
  if (isApiHandlerBuild(entrypoint) || !ownsRouteTable(service)) {
    return undefined;
  }

  return [
    { handle: 'filesystem' as const },
    { src: '/(.*)', dest: `/${entrypoint.replace(/\.rs$/, '')}` },
  ];
}

/**
 * Whether this build is an individual `api/**` serverless handler — the one
 * project shape that isn't a whole-app HTTP server. Deliberately not keyed on
 * the framework slug, so any Rust HTTP library works.
 */
export function isApiHandlerBuild(entrypoint: string): boolean {
  return entrypoint.startsWith('api/');
}

// `shouldServe()` asks for the mode on every request, and resolving it walks
// directories and parses TOML. Cached for the process, so switching the
// `vercel_runtime` dependency mid-session needs a `vercel dev` restart.
const STANDALONE_MODE_CACHE = new Map<string, Promise<boolean>>();
const RESOLVED_STANDALONE_MODE_CACHE = new Map<string, Promise<boolean>>();
const RESOLVED_STANDALONE_MODE_HINTS = new Map<string, Promise<boolean>>();

/**
 * A whole-app build is a standalone server behind the shared IPC proxy.
 * Projects depending on `vercel_runtime` speak that protocol themselves, so they
 * keep the original single-binary output.
 */
export function useStandaloneMode(
  workPath: string,
  entrypoint: string
): Promise<boolean> {
  if (isApiHandlerBuild(entrypoint)) return Promise.resolve(false);

  const key = `${workPath}::${entrypoint}`;
  const resolved = RESOLVED_STANDALONE_MODE_HINTS.get(key);
  if (resolved) return resolved;

  let result = STANDALONE_MODE_CACHE.get(key);
  if (!result) {
    result = hasVercelRuntimeDependency(workPath, entrypoint).then(
      hasCrate => !hasCrate
    );
    STANDALONE_MODE_CACHE.set(key, result);
  }
  return result;
}

/**
 * Replace the manifest routing hint with Cargo's selected package and resolved
 * dependencies before choosing which build or dev-server implementation runs.
 */
export function resolveStandaloneMode(
  workPath: string,
  entrypoint: string,
  rustEnv: RustEnv,
  filterPlatform?: string
): Promise<boolean> {
  if (isApiHandlerBuild(entrypoint)) return Promise.resolve(false);

  const modeKey = `${workPath}::${entrypoint}`;
  const cacheKey = `${modeKey}::${filterPlatform ?? 'host'}`;
  let result = RESOLVED_STANDALONE_MODE_CACHE.get(cacheKey);
  if (!result) {
    result = (async () => {
      const metadata = await getCargoMetadata(
        { cwd: workPath, env: rustEnv },
        filterPlatform
      );
      const binary = resolveStandaloneBinary(metadata, entrypoint, workPath);
      return !resolvedPackageUsesVercelRuntime(metadata, binary);
    })();
    RESOLVED_STANDALONE_MODE_CACHE.set(cacheKey, result);
  }
  RESOLVED_STANDALONE_MODE_HINTS.set(modeKey, result);
  return result;
}

// Test seam: suites reusing a temp dir would otherwise see a stale mode.
export function clearStandaloneModeCache(): void {
  STANDALONE_MODE_CACHE.clear();
  RESOLVED_STANDALONE_MODE_CACHE.clear();
  RESOLVED_STANDALONE_MODE_HINTS.clear();
}

export interface StandaloneBuildContext {
  rustEnv: RustEnv;
  crossCompilation: boolean;
  verbose: boolean;
}

export async function buildStandaloneServer(
  options: BuildOptions,
  { rustEnv, crossCompilation, verbose }: StandaloneBuildContext
): Promise<BuildResultVX> {
  const { entrypoint, workPath, config, service } = options;

  debug(`Building standalone Rust server: ${entrypoint}`);

  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });
  const architecture = lambdaOptions?.architecture || 'x86_64';
  const targetTriple = getTargetTriple(architecture);
  const metadataTarget = options.meta?.isDev
    ? await getRustHostTargetTriple(rustEnv)
    : targetTriple;

  const cargoMetadata = await getCargoMetadata(
    { cwd: workPath, env: rustEnv },
    metadataTarget
  );
  const binary = resolveStandaloneBinary(cargoMetadata, entrypoint, workPath);
  assertStandaloneBinary(cargoMetadata, binary, workPath);

  const cargoWorkspace = await findCargoWorkspace({
    env: rustEnv,
    cwd: path.dirname(binary.srcPath),
  });
  const cargoBuildConfiguration =
    await findCargoBuildConfiguration(cargoWorkspace);

  await runUserScripts(workPath);

  await compileCargoBinary({
    workPath,
    rustEnv,
    binaryName: binary.name,
    packageName: binary.packageName,
    crossCompilation,
    targetTriple,
    release: true,
    verbose,
  });

  const userServerPath = resolveCompiledBinaryPath({
    targetDirectory: cargoMetadata.target_directory,
    crossCompilation,
    targetTriple,
    buildTarget: cargoBuildConfiguration?.build.target,
    variant: 'release',
    binaryName: binary.name,
  });

  debug(`Compiled standalone Rust server at ${userServerPath}`);

  const includedFiles = await gatherExtraFiles(config.includeFiles, workPath);

  const lambda = await createStandaloneLambda({
    userServerPath,
    architecture,
    lambdaOptions,
    includedFiles,
    runtimeLanguage: 'rust',
  });
  lambda.zipBuffer = await lambda.createZip();

  await generateProjectManifest({
    workPath,
    cargoMetadata,
    framework: config?.framework ?? undefined,
    serviceType: service ? getReportedServiceType(service) : undefined,
  });

  // V1 services keep the scalar V3 result so the CLI names the output with the
  // internal `_svc/<name>` namespace their shared route table expects.
  if (!ownsRouteTable(service)) {
    return { resultVersion: 3, result: { output: lambda } };
  }

  return {
    resultVersion: 2,
    result: {
      output: { [STANDALONE_LAMBDA_PATH]: lambda },
      routes: getStandaloneServerRoutes(service),
    },
  };
}

// Persistent dev servers keyed by workPath + entrypoint, reused across requests
// so each request doesn't pay a `cargo build`.
interface PersistentDevServer {
  handle: DevProxyHandle;
  files: Map<string, File>;
}

const PERSISTENT_SERVERS = new Map<string, PersistentDevServer>();
const PENDING_STARTS = new Map<string, Promise<PersistentDevServer>>();

function snapshotFiles(files: Files): Map<string, File> {
  return new Map(Object.entries(files));
}

function filesAreUnchanged(snapshot: Map<string, File>, files: Files): boolean {
  const entries = Object.entries(files);
  return (
    snapshot.size === entries.length &&
    entries.every(([filePath, file]) => snapshot.get(filePath) === file)
  );
}

let cleanupHandlersInstalled = false;

function installGlobalCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const killAll = () => {
    for (const [key, server] of PERSISTENT_SERVERS.entries()) {
      PERSISTENT_SERVERS.delete(key);
      try {
        server.handle.child.kill('SIGKILL');
      } catch (err) {
        debug(`Error killing standalone Rust dev server: ${err}`);
      }
    }
  };

  // Don't exit here, so `vercel dev`'s own interrupt handlers still run.
  process.on('SIGINT', killAll);
  process.on('SIGTERM', killAll);
  process.on('exit', killAll);
}

// `persistent` tells the CLI the builder owns this server across requests.
// Without it the CLI registers a per-response teardown that tree-kills the
// process as soon as two responses close, i.e. on any concurrent traffic.
function toDevServerResult(
  serverKey: string,
  handle: DevProxyHandle
): StartDevServerResult {
  return {
    port: handle.port,
    pid: handle.pid,
    persistent: true,
    shutdown: async () => {
      if (PERSISTENT_SERVERS.get(serverKey)?.handle === handle) {
        PERSISTENT_SERVERS.delete(serverKey);
      }
      await handle.close();
    },
  };
}

export async function startStandaloneDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  const { entrypoint, workPath, meta = {} } = opts;
  const serverKey = `${workPath}::${entrypoint}`;

  const existing = PERSISTENT_SERVERS.get(serverKey);
  if (existing && filesAreUnchanged(existing.files, opts.files)) {
    return toDevServerResult(serverKey, existing.handle);
  }

  const pending = PENDING_STARTS.get(serverKey);
  if (pending) {
    await pending;
    return startStandaloneDevServer(opts);
  }

  const startPromise = (async () => {
    if (existing) {
      PERSISTENT_SERVERS.delete(serverKey);
      await existing.handle.close();
    }

    await installRustToolchain();

    const rustEnv = createRustEnv();
    const hostTarget = await getRustHostTargetTriple(rustEnv);

    const cargoMetadata = await getCargoMetadata(
      { cwd: workPath, env: rustEnv },
      hostTarget
    );
    const binary = resolveStandaloneBinary(cargoMetadata, entrypoint, workPath);
    assertStandaloneBinary(cargoMetadata, binary, workPath);

    const cargoWorkspace = await findCargoWorkspace({
      env: rustEnv,
      cwd: path.dirname(binary.srcPath),
    });
    const cargoBuildConfiguration =
      await findCargoBuildConfiguration(cargoWorkspace);

    await compileCargoBinary({
      workPath,
      rustEnv,
      binaryName: binary.name,
      packageName: binary.packageName,
      crossCompilation: false,
      targetTriple: getTargetTriple('x86_64'),
      release: false,
      verbose: Boolean(process.env.VERCEL_BUILDER_DEBUG ?? false),
    });

    const executablePath = resolveCompiledBinaryPath({
      targetDirectory: cargoMetadata.target_directory,
      crossCompilation: false,
      targetTriple: getTargetTriple('x86_64'),
      buildTarget: cargoBuildConfiguration?.build.target,
      variant: 'debug',
      binaryName: binary.name,
    });

    const env = cloneEnv(process.env, meta.env);

    debug(`Starting standalone Rust dev server: ${executablePath}`);

    const handle = await startDevProxy({
      port: typeof meta.port === 'number' ? meta.port : undefined,
      env,
      label: 'Standalone Rust dev server',
      spawnServer: internalPort => {
        const child = spawn(executablePath, [], {
          cwd: workPath,
          env: cloneEnv(env, { PORT: String(internalPort) }),
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const forward = (
          stream: ChildProcess['stdout'],
          onData: ((data: Buffer) => void) | undefined,
          fallback: NodeJS.WriteStream
        ) => {
          stream?.on('data', data => {
            const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
            if (onData) {
              onData(chunk);
            } else {
              // `Buffer` is not assignable to `Uint8Array<ArrayBufferLike>`
              // under newer `@types/node`, so pass a plain view of the bytes.
              fallback.write(
                new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
              );
            }
          });
        };

        forward(child.stdout, opts.onStdout, process.stdout);
        forward(child.stderr, opts.onStderr, process.stderr);

        return child;
      },
    });

    const server = { handle, files: snapshotFiles(opts.files) };
    PERSISTENT_SERVERS.set(serverKey, server);
    // Tear the proxy down with the server it fronts, so the next request
    // starts a fresh one instead of hitting a proxy with nothing behind it.
    handle.child.once('exit', () => {
      if (PERSISTENT_SERVERS.get(serverKey)?.handle === handle) {
        PERSISTENT_SERVERS.delete(serverKey);
      }
      handle.close().catch(err => {
        debug(`Error closing standalone Rust dev proxy: ${err}`);
      });
    });
    installGlobalCleanupHandlers();

    return server;
  })();

  PENDING_STARTS.set(serverKey, startPromise);
  try {
    const server = await startPromise;
    return toDevServerResult(serverKey, server.handle);
  } finally {
    if (PENDING_STARTS.get(serverKey) === startPromise) {
      PENDING_STARTS.delete(serverKey);
    }
  }
}
