/**
 * Standalone Go server support for Vercel runtime framework preset mode.
 *
 * This module handles building and running Go HTTP servers as standalone
 * executables (not wrapped with go-bridge). It uses a bootstrap wrapper
 * (vc_init.go) that implements the Vercel IPC protocol.
 *
 * Architecture:
 * - User's server is built as 'user-server' binary
 * - Bootstrap wrapper (vc_init.go) is built as 'executable' (main entrypoint)
 * - Bootstrap handles IPC protocol and reverse proxies to user's server
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { readFile, writeFile, pathExists, copy } from 'fs-extra';
import {
  BuildOptions,
  Files,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  download,
  Lambda,
  FileBlob,
  getWriteableDirectory,
  debug,
  cloneEnv,
  getLambdaOptionsFromFunction,
} from '@vercel/build-utils';

import { createGo } from './go-helpers';

/**
 * Find the go.mod file starting from a directory and scanning up.
 */
async function findGoModPath(entrypointDir: string, workPath: string) {
  let goModPath: string | undefined = undefined;
  let isGoModInRootDir = false;
  let dir = entrypointDir;

  while (!isGoModInRootDir) {
    isGoModInRootDir = dir === workPath;
    const goMod = join(dir, 'go.mod');
    if (await pathExists(goMod)) {
      goModPath = goMod;
      debug(`Found ${goModPath}"`);
      break;
    }
    dir = dirname(dir);
  }

  return {
    goModPath,
    isGoModInRootDir,
  };
}

/**
 * Build a standalone Go HTTP server (runtime framework preset mode).
 * This builds a bootstrap wrapper that handles the Vercel IPC protocol
 * and proxies requests to the user's Go server.
 */
export async function buildStandaloneServer({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
}: BuildOptions): Promise<{ output: Lambda }> {
  debug(`Building standalone Go server: ${entrypoint}`);

  await download(files, workPath, meta);

  // Get lambda options from config (memory, maxDuration, regions, architecture)
  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const architecture = lambdaOptions?.architecture || 'x86_64';

  // Cross-compile for Linux with appropriate architecture
  const env = cloneEnv(process.env, meta.env, {
    GOARCH: architecture === 'arm64' ? 'arm64' : 'amd64',
    GOOS: 'linux',
    CGO_ENABLED: '0',
  });

  const { goModPath } = await findGoModPath(workPath, workPath);
  const modulePath = goModPath ? dirname(goModPath) : workPath;

  const go = await createGo({
    modulePath,
    opts: { cwd: workPath, env },
    workPath,
  });

  const outDir = await getWriteableDirectory();
  const userServerPath = join(outDir, 'user-server');
  const bootstrapPath = join(outDir, 'executable');

  // Determine build target based on entrypoint location
  // - main.go at root: build '.'
  // - cmd/api/main.go: build './cmd/api'
  const buildTarget =
    entrypoint === 'main.go' ? '.' : './' + dirname(entrypoint);

  debug(
    `Building user Go server (${architecture}): go build ${buildTarget} -> ${userServerPath}`
  );

  try {
    await go.build(buildTarget, userServerPath);
  } catch (err) {
    console.error(`Failed to build standalone Go server: ${buildTarget}`);
    throw err;
  }

  // Build the bootstrap wrapper that handles IPC protocol (vc_init.go)
  const bootstrapSrc = join(__dirname, '../vc_init.go');
  debug(`Building bootstrap wrapper: ${bootstrapSrc} -> ${bootstrapPath}`);

  try {
    // Create a temporary directory for building the bootstrap
    const bootstrapBuildDir = await getWriteableDirectory();
    const bootstrapGoFile = join(bootstrapBuildDir, 'main.go');

    // Copy bootstrap source to temp directory
    await copy(bootstrapSrc, bootstrapGoFile);

    // Initialize a minimal go.mod for the bootstrap
    const bootstrapGoMod = join(bootstrapBuildDir, 'go.mod');
    await writeFile(bootstrapGoMod, 'module vc-init\n\ngo 1.21\n');

    // Build bootstrap with same env (cross-compile settings)
    const bootstrapGo = await createGo({
      modulePath: bootstrapBuildDir,
      opts: { cwd: bootstrapBuildDir, env },
      workPath: bootstrapBuildDir,
    });

    await bootstrapGo.build('.', bootstrapPath);
  } catch (err) {
    console.error('Failed to build bootstrap wrapper');
    throw err;
  }

  // Gather any additional files to include (user-specified via includeFiles)
  // Note: Static files in public/static/ should be handled by the static builder,
  // not bundled with the function. This follows the same pattern as Python.
  const includedFiles: Files = {};
  if (config && config.includeFiles) {
    const patterns = Array.isArray(config.includeFiles)
      ? config.includeFiles
      : [config.includeFiles];
    for (const pattern of patterns) {
      const fsFiles = await glob(pattern, workPath);
      for (const [assetName, asset] of Object.entries(fsFiles)) {
        includedFiles[assetName] = asset;
      }
    }
  }

  // Read both binaries as FileBlob (embedded data)
  // This ensures they persist regardless of temp file lifecycle
  const [userServerData, bootstrapData] = await Promise.all([
    readFile(userServerPath),
    readFile(bootstrapPath),
  ]);

  const lambda = new Lambda({
    ...lambdaOptions,
    files: {
      ...includedFiles,
      // Bootstrap is the main entrypoint (handles IPC protocol)
      executable: new FileBlob({ mode: 0o755, data: bootstrapData }),
      // User's server is spawned by bootstrap
      'user-server': new FileBlob({ mode: 0o755, data: userServerData }),
    },
    handler: 'executable',
    runtime: 'executable',
    supportsResponseStreaming: true,
    architecture,
    runtimeLanguage: 'go',
  });

  return { output: lambda };
}

/**
 * Start a dev server for standalone Go server mode.
 * This runs `go run <target>` directly with the PORT environment variable.
 */
export async function startStandaloneDevServer(
  opts: StartDevServerOptions,
  resolvedEntrypoint: string
): Promise<StartDevServerResult> {
  const { workPath, meta = {} } = opts;

  // Use a random port in the ephemeral range
  const port = Math.floor(Math.random() * (65535 - 49152) + 49152);

  const env = cloneEnv(process.env, meta.env, {
    PORT: String(port),
  });

  // Determine run target based on entrypoint location
  // - main.go at root: go run .
  // - cmd/api/main.go: go run ./cmd/api
  const runTarget =
    resolvedEntrypoint === 'main.go' ? '.' : './' + dirname(resolvedEntrypoint);

  debug(
    `Starting standalone Go dev server: go run ${runTarget} (port ${port})`
  );

  const child = spawn('go', ['run', runTarget], {
    cwd: workPath,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  // Give the server time to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    port,
    pid: child.pid!,
  };
}
